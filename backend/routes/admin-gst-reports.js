/**
 * Admin-only GST reports.
 *
 * Endpoints:
 *   GET    /api/admin/gst/invoices             paginated Invoice list + filters
 *   GET    /api/admin/gst/summary              KPI aggregates (today + month)
 *   POST   /api/admin/gst/export               CSV / XLSX / GSTR-1 export
 *   GET    /api/admin/gst/filings              list of closed filings
 *   POST   /api/admin/gst/filings              close a month (Mark as Filed)
 *   POST   /api/admin/gst/filings/:period/reopen   unlock a period (superadmin)
 *   PATCH  /api/admin/gst/invoices/:id/status  generated → reported
 *
 * All routes require an authenticated admin session.
 */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { logger } = require('../utils/logger');
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateAdmin } = require('../middleware/admin-auth');
const { validate } = require('../middleware/validate');
const {
  gstInvoicesQuerySchema,
  gstSummaryQuerySchema,
  gstExportBodySchema,
  gstFilingBodySchema,
  gstStatusBodySchema,
} = require('../validation/schemas');

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function paiseToRupees(p) {
  return Math.round(Number(p) || 0) / 100;
}

function fiscalYearFromPeriod(period /* "YYYY-MM" */) {
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m) return '';
  const fyStart = m >= 4 ? y : y - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

function periodLabelFromDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function todayRange(d = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function periodRange(period /* "YYYY-MM" */) {
  const [y, m] = String(period).split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

/**
 * Build a mongo filter object from sanitized query/body params.
 */
function buildInvoiceFilter(p = {}) {
  const filter = {};
  if (p.period) filter.filingPeriod = p.period;
  if (p.from || p.to) {
    filter.invoiceDate = {};
    if (p.from) filter.invoiceDate.$gte = new Date(p.from);
    if (p.to) {
      const end = new Date(p.to);
      // Make `to` inclusive of the whole day.
      end.setHours(23, 59, 59, 999);
      filter.invoiceDate.$lte = end;
    }
  }
  if (p.source && p.source !== 'all') filter.source = p.source;
  if (p.provider && p.provider !== 'all') filter['payment.provider'] = p.provider;
  if (p.status && p.status !== 'all') filter.status = p.status;
  if (p.buyerType && p.buyerType !== 'all') filter['buyer.type'] = p.buyerType;
  if (p.search) {
    const re = new RegExp(
      String(p.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
    filter.$or = [
      { invoiceNumber: re },
      { 'buyer.name': re },
      { 'buyer.gstin': re },
      { 'payment.providerPaymentId': re },
    ];
  }
  return filter;
}

// ──────────────────────────────────────────────────────────────────────────
// GET /invoices
// ──────────────────────────────────────────────────────────────────────────
router.get(
  '/invoices',
  authenticateAdmin,
  setupMainDatabase,
  validate(gstInvoicesQuerySchema, 'query'),
  async (req, res) => {
    try {
      const { Invoice } = req.mainModels;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const filter = buildInvoiceFilter(req.query);

      const [rows, total, totals] = await Promise.all([
        Invoice.find(filter)
          .sort({ invoiceDate: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Invoice.countDocuments(filter),
        Invoice.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              taxable: { $sum: '$taxableValuePaise' },
              cgst: { $sum: '$cgstPaise' },
              sgst: { $sum: '$sgstPaise' },
              igst: { $sum: '$igstPaise' },
              totalTax: { $sum: '$totalTaxPaise' },
              grandTotal: { $sum: '$grandTotalPaise' },
            },
          },
        ]),
      ]);

      const agg = totals[0] || {};
      res.json({
        success: true,
        data: {
          rows: rows.map(r => ({
            _id: String(r._id),
            invoiceNumber: r.invoiceNumber,
            invoiceDate: r.invoiceDate,
            source: r.source,
            sourceRef: String(r.sourceRef),
            businessId: String(r.businessId || ''),
            buyer: r.buyer || {},
            seller: r.seller || {},
            placeOfSupply: r.placeOfSupply,
            intraState: r.intraState,
            taxableValuePaise: r.taxableValuePaise,
            cgstPaise: r.cgstPaise,
            sgstPaise: r.sgstPaise,
            igstPaise: r.igstPaise,
            totalTaxPaise: r.totalTaxPaise,
            grandTotalPaise: r.grandTotalPaise,
            gstRate: r.gstRate,
            status: r.status,
            filingPeriod: r.filingPeriod,
            payment: r.payment || {},
          })),
          totals: {
            count: total,
            taxablePaise: agg.taxable || 0,
            cgstPaise: agg.cgst || 0,
            sgstPaise: agg.sgst || 0,
            igstPaise: agg.igst || 0,
            totalTaxPaise: agg.totalTax || 0,
            grandTotalPaise: agg.grandTotal || 0,
          },
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (err) {
      logger.error('[gst-reports] list failed:', err?.message || err);
      res
        .status(500)
        .json({ success: false, error: 'Failed to load invoices' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────
// GET /summary
// ──────────────────────────────────────────────────────────────────────────
router.get(
  '/summary',
  authenticateAdmin,
  setupMainDatabase,
  validate(gstSummaryQuerySchema, 'query'),
  async (req, res) => {
    try {
      const { Invoice, GstFiling } = req.mainModels;
      const period = req.query.period || periodLabelFromDate(new Date());

      const { start: dayStart, end: dayEnd } = todayRange();
      const { start: mStart, end: mEnd } = periodRange(period);

      const baseAgg = [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            taxable: { $sum: '$taxableValuePaise' },
            cgst: { $sum: '$cgstPaise' },
            sgst: { $sum: '$sgstPaise' },
            igst: { $sum: '$igstPaise' },
            totalTax: { $sum: '$totalTaxPaise' },
            grandTotal: { $sum: '$grandTotalPaise' },
          },
        },
      ];

      const [todayAgg, monthAgg, b2bAgg, b2cAgg, filing] = await Promise.all([
        Invoice.aggregate([
          { $match: { invoiceDate: { $gte: dayStart, $lt: dayEnd } } },
          ...baseAgg,
        ]),
        Invoice.aggregate([
          { $match: { invoiceDate: { $gte: mStart, $lt: mEnd } } },
          ...baseAgg,
        ]),
        Invoice.aggregate([
          {
            $match: {
              invoiceDate: { $gte: mStart, $lt: mEnd },
              'buyer.type': 'B2B',
            },
          },
          ...baseAgg,
        ]),
        Invoice.aggregate([
          {
            $match: {
              invoiceDate: { $gte: mStart, $lt: mEnd },
              'buyer.type': 'B2C',
            },
          },
          ...baseAgg,
        ]),
        GstFiling.findOne({ period, reopenedAt: null }).lean(),
      ]);

      const pick = (arr) => arr[0] || {};
      const t = pick(todayAgg);
      const m = pick(monthAgg);
      const b2b = pick(b2bAgg);
      const b2c = pick(b2cAgg);

      res.json({
        success: true,
        data: {
          period,
          today: {
            count: t.count || 0,
            grandTotalPaise: t.grandTotal || 0,
          },
          month: {
            count: m.count || 0,
            taxablePaise: m.taxable || 0,
            cgstPaise: m.cgst || 0,
            sgstPaise: m.sgst || 0,
            igstPaise: m.igst || 0,
            totalTaxPaise: m.totalTax || 0,
            grandTotalPaise: m.grandTotal || 0,
            b2b: {
              count: b2b.count || 0,
              taxablePaise: b2b.taxable || 0,
            },
            b2c: {
              count: b2c.count || 0,
              taxablePaise: b2c.taxable || 0,
            },
          },
          filing: filing
            ? {
                filedAt: filing.filedAt,
                filedBy: filing.filedBy,
                counts: filing.counts,
                totals: filing.totals,
              }
            : null,
        },
      });
    } catch (err) {
      logger.error('[gst-reports] summary failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to load summary' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────
// POST /export
// ──────────────────────────────────────────────────────────────────────────
router.post(
  '/export',
  authenticateAdmin,
  setupMainDatabase,
  validate(gstExportBodySchema, 'body'),
  async (req, res) => {
    try {
      const { Invoice } = req.mainModels;
      const body = req.body || {};
      const format = body.format || 'xlsx';
      const filter = buildInvoiceFilter(body);

      const rows = await Invoice.find(filter)
        .sort({ invoiceDate: 1, invoiceNumber: 1 })
        .lean();

      const XLSX = require('xlsx');

      if (format === 'csv') {
        const data = rows.map(r => flatRow(r));
        const ws = XLSX.utils.json_to_sheet(data);
        const csv = XLSX.utils.sheet_to_csv(ws);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="gst-invoices-${Date.now()}.csv"`
        );
        return res.send(csv);
      }

      if (format === 'gstr1') {
        const wb = XLSX.utils.book_new();

        const b2bRows = rows
          .filter(r => r.buyer?.type === 'B2B')
          .map(r => ({
            'GSTIN/UIN of Recipient': r.buyer?.gstin || '',
            'Receiver Name': r.buyer?.name || '',
            'Invoice Number': r.invoiceNumber,
            'Invoice date': isoDate(r.invoiceDate),
            'Invoice Value': paiseToRupees(r.grandTotalPaise).toFixed(2),
            'Place Of Supply': r.placeOfSupply || '',
            'Reverse Charge': 'N',
            'Applicable % of Tax Rate': '',
            'Invoice Type': 'Regular B2B',
            'E-Commerce GSTIN': '',
            Rate: Math.round((Number(r.gstRate) || 0) * 100),
            'Taxable Value': paiseToRupees(r.taxableValuePaise).toFixed(2),
            'Cess Amount': 0,
          }));

        const b2cRows = rows
          .filter(r => r.buyer?.type === 'B2C')
          .map(r => ({
            'Type': r.intraState ? 'Intra-state' : 'Inter-state',
            'Place Of Supply': r.placeOfSupply || '',
            Rate: Math.round((Number(r.gstRate) || 0) * 100),
            'Taxable Value': paiseToRupees(r.taxableValuePaise).toFixed(2),
            'Cess Amount': 0,
            'E-Commerce GSTIN': '',
          }));

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(b2bRows),
          'b2b'
        );
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(b2cRows),
          'b2cs'
        );

        // Ledger-style detail sheet for accountant reference.
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(rows.map(flatRow)),
          'detail'
        );

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="gstr1-${Date.now()}.xlsx"`
        );
        return res.send(buf);
      }

      // default xlsx
      const data = rows.map(flatRow);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="gst-invoices-${Date.now()}.xlsx"`
      );
      return res.send(buf);
    } catch (err) {
      logger.error('[gst-reports] export failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to export invoices' });
    }
  }
);

function flatRow(r) {
  return {
    'Invoice No': r.invoiceNumber,
    'Date': isoDate(r.invoiceDate),
    'Source': r.source,
    'Customer Name': r.buyer?.name || '',
    'Customer GSTIN': r.buyer?.gstin || '',
    'Customer Type': r.buyer?.type || '',
    'Taxable Value': paiseToRupees(r.taxableValuePaise).toFixed(2),
    'CGST': paiseToRupees(r.cgstPaise).toFixed(2),
    'SGST': paiseToRupees(r.sgstPaise).toFixed(2),
    'IGST': paiseToRupees(r.igstPaise).toFixed(2),
    'Total Tax': paiseToRupees(r.totalTaxPaise).toFixed(2),
    'Invoice Value': paiseToRupees(r.grandTotalPaise).toFixed(2),
    'Tax Rate %': Math.round((Number(r.gstRate) || 0) * 100),
    'Place Of Supply': r.placeOfSupply || '',
    'Payment Mode': r.payment?.provider || '',
    'Payment ID': r.payment?.providerPaymentId || '',
    'Status': r.status,
    'Filing Period': r.filingPeriod || '',
  };
}

function isoDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${day}-${m}-${y}`;
}

// ──────────────────────────────────────────────────────────────────────────
// GET /filings
// ──────────────────────────────────────────────────────────────────────────
router.get(
  '/filings',
  authenticateAdmin,
  setupMainDatabase,
  async (req, res) => {
    try {
      const { GstFiling } = req.mainModels;
      const rows = await GstFiling.find({}).sort({ period: -1 }).lean();
      res.json({
        success: true,
        data: rows.map(r => ({
          _id: String(r._id),
          period: r.period,
          fiscalYear: r.fiscalYear,
          filedAt: r.filedAt,
          filedBy: r.filedBy,
          reopenedAt: r.reopenedAt,
          reopenedBy: r.reopenedBy,
          counts: r.counts || {},
          totals: r.totals || {},
          snapshotPath: r.snapshotPath || null,
        })),
      });
    } catch (err) {
      logger.error('[gst-reports] filings list failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to load filings' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────
// POST /filings — lock a period
// ──────────────────────────────────────────────────────────────────────────
router.post(
  '/filings',
  authenticateAdmin,
  setupMainDatabase,
  validate(gstFilingBodySchema, 'body'),
  async (req, res) => {
    try {
      const { Invoice, GstFiling } = req.mainModels;
      const { period } = req.body;

      // Refuse to double-file.
      const existing = await GstFiling.findOne({ period, reopenedAt: null }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Period ${period} is already filed.`,
        });
      }

      // Aggregate counts/totals for the snapshot.
      const aggResult = await Invoice.aggregate([
        { $match: { filingPeriod: period } },
        {
          $group: {
            _id: '$buyer.type',
            count: { $sum: 1 },
            taxable: { $sum: '$taxableValuePaise' },
            cgst: { $sum: '$cgstPaise' },
            sgst: { $sum: '$sgstPaise' },
            igst: { $sum: '$igstPaise' },
            totalTax: { $sum: '$totalTaxPaise' },
            grandTotal: { $sum: '$grandTotalPaise' },
          },
        },
      ]);

      const totals = {
        taxablePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        totalTaxPaise: 0,
        grandTotalPaise: 0,
      };
      const counts = { total: 0, b2b: 0, b2c: 0 };
      for (const row of aggResult) {
        totals.taxablePaise += row.taxable || 0;
        totals.cgstPaise += row.cgst || 0;
        totals.sgstPaise += row.sgst || 0;
        totals.igstPaise += row.igst || 0;
        totals.totalTaxPaise += row.totalTax || 0;
        totals.grandTotalPaise += row.grandTotal || 0;
        counts.total += row.count || 0;
        if (row._id === 'B2B') counts.b2b = row.count || 0;
        if (row._id === 'B2C') counts.b2c = row.count || 0;
      }

      if (counts.total === 0) {
        return res.status(400).json({
          success: false,
          error: `No invoices exist for period ${period}.`,
        });
      }

      // Write the GstFiling record.
      const filing = await GstFiling.create({
        period,
        fiscalYear: fiscalYearFromPeriod(period),
        filedAt: new Date(),
        filedBy:
          req.admin?.email ||
          req.admin?.username ||
          String(req.admin?._id || 'admin'),
        counts,
        totals,
      });

      // Lock invoices in the period. Use updateMany so the schema
      // pre-findOneAndUpdate hook doesn't fire per-doc (it only allows
      // lifecycle fields anyway, but updateMany bypasses the hook since the
      // docs are currently 'generated'/'reported').
      await Invoice.updateMany(
        { filingPeriod: period, status: { $ne: 'filed' } },
        {
          $set: {
            status: 'filed',
            filingId: filing._id,
            lockedAt: new Date(),
            lockedBy:
              req.admin?.email ||
              req.admin?.username ||
              String(req.admin?._id || 'admin'),
          },
        }
      );

      // Optional CSV snapshot on disk.
      try {
        const snapshotDir = path.join(__dirname, '..', 'uploads', 'gst-filings');
        fs.mkdirSync(snapshotDir, { recursive: true });
        const rows = await Invoice.find({ filingPeriod: period })
          .sort({ invoiceDate: 1, invoiceNumber: 1 })
          .lean();
        const XLSX = require('xlsx');
        const ws = XLSX.utils.json_to_sheet(rows.map(flatRow));
        const csv = XLSX.utils.sheet_to_csv(ws);
        const snapshotPath = path.join(snapshotDir, `${period}.csv`);
        fs.writeFileSync(snapshotPath, csv, 'utf8');
        await GstFiling.updateOne(
          { _id: filing._id },
          { $set: { snapshotPath: `gst-filings/${period}.csv` } }
        );
      } catch (snapshotErr) {
        logger.warn(
          '[gst-reports] snapshot CSV write failed (non-fatal):',
          snapshotErr?.message || snapshotErr
        );
      }

      logger.info(
        `[gst-reports] Period ${period} filed by ${
          req.admin?.email || req.admin?.username || 'admin'
        } — ${counts.total} invoices locked.`
      );

      res.json({
        success: true,
        data: {
          period,
          filedAt: filing.filedAt,
          counts,
          totals,
        },
      });
    } catch (err) {
      logger.error('[gst-reports] filing failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to file period' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────
// POST /filings/:period/reopen
// ──────────────────────────────────────────────────────────────────────────
router.post(
  '/filings/:period/reopen',
  authenticateAdmin,
  setupMainDatabase,
  async (req, res) => {
    try {
      // Only super_admin can reopen — filed returns already at the GST portal
      // can't be undone, but reopening locally is for correcting mistakes
      // before the return was actually uploaded.
      if (req.admin?.role !== 'super_admin') {
        return res
          .status(403)
          .json({ success: false, error: 'Only a super admin can reopen a filed period' });
      }

      const { period } = req.params;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period))) {
        return res.status(400).json({ success: false, error: 'Invalid period' });
      }

      const { Invoice, GstFiling } = req.mainModels;
      const filing = await GstFiling.findOne({ period, reopenedAt: null });
      if (!filing) {
        return res
          .status(404)
          .json({ success: false, error: 'No active filing for that period' });
      }

      filing.reopenedAt = new Date();
      filing.reopenedBy =
        req.admin?.email || req.admin?.username || String(req.admin?._id || 'admin');
      await filing.save();

      await Invoice.updateMany(
        { filingPeriod: period, filingId: filing._id },
        {
          $set: {
            status: 'generated',
            filingId: null,
            lockedAt: null,
            lockedBy: null,
          },
        }
      );

      logger.warn(
        `[gst-reports] Period ${period} reopened by ${filing.reopenedBy}`
      );

      res.json({ success: true, data: { period, reopenedAt: filing.reopenedAt } });
    } catch (err) {
      logger.error('[gst-reports] reopen failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to reopen period' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────
// PATCH /invoices/:id/status
// ──────────────────────────────────────────────────────────────────────────
router.patch(
  '/invoices/:id/status',
  authenticateAdmin,
  setupMainDatabase,
  validate(gstStatusBodySchema, 'body'),
  async (req, res) => {
    try {
      const { Invoice } = req.mainModels;
      const { id } = req.params;
      const { status } = req.body;

      if (!/^[a-f\d]{24}$/i.test(String(id))) {
        return res.status(400).json({ success: false, error: 'Invalid invoice id' });
      }

      const invoice = await Invoice.findById(id);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      if (invoice.status === 'filed') {
        return res.status(409).json({
          success: false,
          error: 'Invoice is filed and can no longer be modified',
        });
      }
      // Only generated ↔ reported are allowed here; filed is reserved for the
      // period-level POST /filings endpoint.
      if (!['generated', 'reported'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid target status' });
      }

      invoice.status = status;
      await invoice.save();
      res.json({ success: true, data: { _id: String(invoice._id), status } });
    } catch (err) {
      logger.error('[gst-reports] status change failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────
// GET /invoices/:id/download — one invoice PDF (admin, any business)
// ──────────────────────────────────────────────────────────────────────────
router.get(
  '/invoices/:id/download',
  authenticateAdmin,
  setupMainDatabase,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!/^[a-f\d]{24}$/i.test(String(id))) {
        return res.status(400).json({ success: false, error: 'Invalid invoice id' });
      }

      const { Invoice } = req.mainModels;
      const invoice = await Invoice.findById(id).lean();
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      // Re-use the existing PDF builders so the printed invoice always matches
      // the live seller context.
      let built;
      if (invoice.source === 'wallet') {
        const { buildInvoicePDFForTransaction } = require('../lib/send-wallet-invoice');
        built = await buildInvoicePDFForTransaction({
          transactionId: invoice.sourceRef,
        });
      } else {
        const { buildPlanInvoicePDFForTransaction } = require('../lib/send-plan-invoice');
        built = await buildPlanInvoicePDFForTransaction({
          transactionId: invoice.sourceRef,
        });
      }

      const { pdfBuffer, invoiceNumber } = built;
      const safeFilename = `${String(invoiceNumber).replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      logger.error('[gst-reports] download failed:', err?.message || err);
      res.status(500).json({ success: false, error: 'Failed to generate invoice PDF' });
    }
  }
);

module.exports = router;
