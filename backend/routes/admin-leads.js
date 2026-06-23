/**
 * Platform admin lead management (main database).
 */

'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');
const { logAdminActivity, getClientIp } = require('../utils/admin-logger');
const { notifyPlatformAdminsPendingLead } = require('../lib/notify-platform-leads-pending');
const { linkPlatformLeadToBusiness } = require('../lib/link-platform-lead-to-business');

function adminDisplayName(admin) {
  return (
    admin.name ||
    `${admin.firstName || ''} ${admin.lastName || ''}`.trim() ||
    admin.email ||
    'Admin'
  );
}

function getPlatformLeadModels(req) {
  const { PlatformLead, PlatformLeadActivity, Admin, Business } = req.mainModels;
  return { PlatformLead, PlatformLeadActivity, Admin, Business };
}

router.use(setupMainDatabase, authenticateAdmin);

// Active admins for assignment filter
router.get('/assignees', checkAdminPermission('leads', 'view'), async (req, res) => {
  try {
    const { Admin } = req.mainModels;
    const admins = await Admin.find({ isActive: true })
      .select('firstName lastName email name role')
      .sort({ firstName: 1 })
      .lean();

    const rows = admins.map((a) => ({
      _id: a._id,
      name: a.name || `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email,
      email: a.email,
    }));

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Admin leads assignees error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/', checkAdminPermission('leads', 'view'), async (req, res) => {
  try {
    const { PlatformLead } = getPlatformLeadModels(req);
    const {
      page = 1,
      limit = 50,
      search = '',
      status,
      assignedAdminId,
      source,
      startDate,
      endDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (search && String(search).trim()) {
      const term = String(search).trim();
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { salonName: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ];
    }
    if (status) query.status = status;
    if (assignedAdminId) query.assignedAdminId = assignedAdminId;
    if (source) query.source = source;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [leads, total] = await Promise.all([
      PlatformLead.find(query)
        .populate('assignedAdminId', 'firstName lastName email name')
        .populate('convertedToBusinessId', 'name businessName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PlatformLead.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    logger.error('Admin list leads error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', checkAdminPermission('leads', 'view'), async (req, res) => {
  try {
    const { PlatformLead } = getPlatformLeadModels(req);
    const lead = await PlatformLead.findById(req.params.id)
      .populate('assignedAdminId', 'firstName lastName email name')
      .populate('convertedToBusinessId', 'name businessName');

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    logger.error('Admin get lead error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id/activities', checkAdminPermission('leads', 'view'), async (req, res) => {
  try {
    const { PlatformLead, PlatformLeadActivity } = getPlatformLeadModels(req);
    const lead = await PlatformLead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const leadObjectId = new mongoose.Types.ObjectId(req.params.id);
    const activities = await PlatformLeadActivity.find({ leadId: leadObjectId }).sort({ createdAt: -1 });

    res.json({ success: true, data: activities });
  } catch (error) {
    logger.error('Admin lead activities error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', checkAdminPermission('leads', 'create'), async (req, res) => {
  try {
    const { PlatformLead, PlatformLeadActivity } = getPlatformLeadModels(req);
    const {
      name,
      salonName,
      phone,
      email,
      source = 'walk-in',
      status = 'new',
      gender,
      interestedIn,
      assignedAdminId,
      followUpDate,
      notes,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required' });
    }

    const newLead = new PlatformLead({
      name: String(name).trim(),
      salonName: salonName ? String(salonName).trim() : '',
      phone: String(phone).trim(),
      email: email ? String(email).trim() : undefined,
      source,
      status,
      gender,
      interestedIn: interestedIn ? String(interestedIn).trim() : '',
      assignedAdminId: assignedAdminId || undefined,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      notes: notes || '',
      createdByAdminId: req.admin._id,
    });

    const savedLead = await newLead.save();
    const populatedLead = await PlatformLead.findById(savedLead._id)
      .populate('assignedAdminId', 'firstName lastName email name');

    const performedBy = req.admin._id;
    const performedByName = adminDisplayName(req.admin);
    const activities = [
      {
        leadId: savedLead._id,
        activityType: 'created',
        performedBy,
        performedByName,
        newValue: {
          name: savedLead.name,
          phone: savedLead.phone,
          source: savedLead.source,
          status: savedLead.status,
        },
        description: `Lead created from ${source}`,
      },
    ];

    if (savedLead.followUpDate) {
      activities.push({
        leadId: savedLead._id,
        activityType: 'follow_up_scheduled',
        performedBy,
        performedByName,
        newValue: savedLead.followUpDate,
        field: 'followUpDate',
        description: `Follow-up scheduled for ${savedLead.followUpDate.toLocaleDateString()}`,
      });
    }
    if (savedLead.assignedAdminId) {
      activities.push({
        leadId: savedLead._id,
        activityType: 'admin_assigned',
        performedBy,
        performedByName,
        newValue: savedLead.assignedAdminId,
        field: 'assignedAdminId',
        description: 'Admin assigned',
      });
    }
    if (savedLead.notes && savedLead.notes.trim()) {
      activities.push({
        leadId: savedLead._id,
        activityType: 'notes_updated',
        performedBy,
        performedByName,
        newValue: savedLead.notes,
        field: 'notes',
        description: 'Notes added',
      });
    }

    await PlatformLeadActivity.insertMany(activities);

    logAdminActivity({
      adminId: req.admin,
      action: 'create',
      module: 'leads',
      details: { leadId: savedLead._id, name: savedLead.name },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    }).catch((err) => logger.error('Failed to log admin lead create:', err));

    if (!savedLead.assignedAdminId) {
      notifyPlatformAdminsPendingLead(req.mainModels, savedLead);
    }

    res.status(201).json({ success: true, data: populatedLead });
  } catch (error) {
    logger.error('Admin create lead error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', checkAdminPermission('leads', 'update'), async (req, res) => {
  try {
    const { PlatformLead, PlatformLeadActivity } = getPlatformLeadModels(req);
    const {
      name,
      phone,
      salonName,
      email,
      source,
      status,
      gender,
      interestedIn,
      assignedAdminId,
      followUpDate,
      notes,
    } = req.body;

    const lead = await PlatformLead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const performedBy = req.admin._id;
    const performedByName = adminDisplayName(req.admin);
    const activities = [];

    const statusActivityDetails =
      notes !== undefined ? { statusNoteSnapshot: String(notes) } : {};

    if (status !== undefined) {
      if (lead.status === 'converted' && status !== 'converted') {
        return res.status(400).json({
          success: false,
          error: 'Converted leads cannot be changed to another status.',
        });
      }
      if (lead.status === 'trial' && !['trial', 'converted', 'lost'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Trial leads can only be marked as Converted or Lost.',
        });
      }
      if (lead.status !== status) {
        activities.push({
          leadId: lead._id,
          activityType: 'status_changed',
          performedBy,
          performedByName,
          previousValue: lead.status,
          newValue: status,
          field: 'status',
          description: `Status changed from ${lead.status} to ${status}`,
          details: statusActivityDetails,
        });
        lead.status = status;
      } else if (notes !== undefined && String(notes).trim()) {
        activities.push({
          leadId: lead._id,
          activityType: 'status_changed',
          performedBy,
          performedByName,
          previousValue: lead.status,
          newValue: status,
          field: 'status',
          description: `Status confirmed as ${status}`,
          details: statusActivityDetails,
        });
      }
    }

    if (assignedAdminId !== undefined && String(lead.assignedAdminId || '') !== String(assignedAdminId || '')) {
      const activityType = lead.assignedAdminId ? 'admin_changed' : 'admin_assigned';
      activities.push({
        leadId: lead._id,
        activityType,
        performedBy,
        performedByName,
        previousValue: lead.assignedAdminId,
        newValue: assignedAdminId || null,
        field: 'assignedAdminId',
        description: lead.assignedAdminId ? 'Assignee changed' : 'Admin assigned',
      });
      lead.assignedAdminId = assignedAdminId || undefined;
    }

    if (followUpDate !== undefined) {
      const oldDate = lead.followUpDate ? lead.followUpDate.toISOString() : null;
      const newDate = followUpDate ? new Date(followUpDate).toISOString() : null;
      if (oldDate !== newDate) {
        const activityType = lead.followUpDate ? 'follow_up_updated' : 'follow_up_scheduled';
        activities.push({
          leadId: lead._id,
          activityType,
          performedBy,
          performedByName,
          previousValue: lead.followUpDate,
          newValue: followUpDate ? new Date(followUpDate) : null,
          field: 'followUpDate',
          description: followUpDate
            ? `Follow-up scheduled for ${new Date(followUpDate).toLocaleDateString()}`
            : 'Follow-up cleared',
        });
        lead.followUpDate = followUpDate ? new Date(followUpDate) : null;
      }
    }

    if (notes !== undefined && lead.notes !== notes) {
      activities.push({
        leadId: lead._id,
        activityType: 'notes_updated',
        performedBy,
        performedByName,
        previousValue: lead.notes,
        newValue: notes,
        field: 'notes',
        description: notes ? 'Notes updated' : 'Notes cleared',
      });
      lead.notes = notes;
    } else if (notes !== undefined && notes && String(notes).trim()) {
      activities.push({
        leadId: lead._id,
        activityType: 'notes_updated',
        performedBy,
        performedByName,
        previousValue: lead.notes,
        newValue: notes,
        field: 'notes',
        description: 'Notes confirmed',
      });
    }

    if (name) lead.name = String(name).trim();
    if (phone) lead.phone = String(phone).trim();
    if (salonName !== undefined) lead.salonName = salonName ? String(salonName).trim() : '';
    if (email !== undefined) lead.email = email ? String(email).trim() : '';
    if (source) lead.source = source;
    if (gender !== undefined) lead.gender = gender || undefined;
    if (interestedIn !== undefined) lead.interestedIn = interestedIn ? String(interestedIn).trim() : '';

    await lead.save();

    if (activities.length > 0) {
      await PlatformLeadActivity.insertMany(activities);
    }

    const populatedLead = await PlatformLead.findById(lead._id)
      .populate('assignedAdminId', 'firstName lastName email name')
      .populate('convertedToBusinessId', 'name businessName');

    res.json({ success: true, data: populatedLead });
  } catch (error) {
    logger.error('Admin update lead error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/:id/convert', checkAdminPermission('leads', 'update'), async (req, res) => {
  try {
    const models = getPlatformLeadModels(req);
    const { businessId } = req.body;

    if (!businessId) {
      return res.status(400).json({ success: false, error: 'businessId is required' });
    }

    await linkPlatformLeadToBusiness(models, {
      leadId: req.params.id,
      businessId,
      admin: req.admin,
    });

    const { PlatformLead } = models;
    const populatedLead = await PlatformLead.findById(req.params.id)
      .populate('assignedAdminId', 'firstName lastName email name')
      .populate('convertedToBusinessId', 'name businessName');

    res.json({ success: true, data: populatedLead });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.code === 'ALREADY_CONVERTED') {
      return res.status(400).json({ success: false, error: error.message });
    }
    logger.error('Admin convert lead error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', checkAdminPermission('leads', 'delete'), async (req, res) => {
  try {
    const { PlatformLead, PlatformLeadActivity } = getPlatformLeadModels(req);
    const lead = await PlatformLead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    await PlatformLeadActivity.deleteMany({ leadId: lead._id });

    logAdminActivity({
      adminId: req.admin,
      action: 'delete',
      module: 'leads',
      details: { leadId: lead._id, name: lead.name },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    }).catch((err) => logger.error('Failed to log admin lead delete:', err));

    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    logger.error('Admin delete lead error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
