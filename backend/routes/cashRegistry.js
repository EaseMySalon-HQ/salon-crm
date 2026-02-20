const express = require('express');
const router = express.Router();
const CashRegistry = require('../models/CashRegistry');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const { authenticateToken: auth } = require('../middleware/auth');
const { parseDateIST, getStartOfDayIST, getEndOfDayIST } = require('../utils/date-utils');

// Test endpoint to verify connection (no auth for testing) - MUST BE FIRST
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit!');
  res.json({ 
    success: true, 
    message: 'Cash registry test endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Get all cash registry entries with pagination and filtering
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, dateFrom, dateTo, shiftType, search } = req.query;
    
    const query = {};
    
    // Date range filtering
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }
    
    // Shift type filtering
    if (shiftType) {
      query.shiftType = shiftType;
    }
    
    // Search filtering
    if (search) {
      query.$or = [
        { createdBy: { $regex: search, $options: 'i' } },
        { balanceDifferenceReason: { $regex: search, $options: 'i' } },
        { onlineCashDifferenceReason: { $regex: search, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { date: -1, createdAt: -1 }
    };
    
    const cashRegistries = await CashRegistry.find(query)
      .sort(options.sort)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit);
    
    const total = await CashRegistry.countDocuments(query);
    
    res.json({
      data: cashRegistries,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error fetching cash registries:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get cash registry entry by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    res.json(cashRegistry);
  } catch (error) {
    console.error('Error fetching cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new cash registry entry
router.post('/', auth, async (req, res) => {
  try {
    console.log('🔵 Received cash registry request:', {
      body: req.body,
      user: req.user,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    
    const {
      date,
      shiftType,
      denominations,
      notes,
      openingBalance,
      closingBalance,
      onlineCash,
      posCash
    } = req.body;
    
    // Validate required fields
    if (!date || !shiftType || !denominations || !Array.isArray(denominations)) {
      return res.status(400).json({ 
        message: 'Missing required fields: date, shiftType, and denominations array are required' 
      });
    }
    
    // Calculate totals from denominations
    const totalBalance = denominations.reduce((sum, denom) => {
      if (!denom.value || !denom.count || !denom.total) {
        throw new Error(`Invalid denomination structure: ${JSON.stringify(denom)}`);
      }
      
      // Ensure values are valid numbers
      const value = Number(denom.value);
      const count = Number(denom.count);
      const total = Number(denom.total);
      
      if (isNaN(value) || isNaN(count) || isNaN(total)) {
        throw new Error(`Invalid denomination values: value=${denom.value}, count=${denom.count}, total=${denom.total}`);
      }
      
      if (value <= 0 || count <= 0 || total <= 0) {
        throw new Error(`Invalid denomination values: value=${value}, count=${count}, total=${total}`);
      }
      
      return sum + total;
    }, 0);
    
    // Parse date in IST (Asia/Kolkata) - all dates use IST
    const dateObj = parseDateIST(date);
    const startOfDay = getStartOfDayIST(date);
    const endOfDay = getEndOfDayIST(date);
    
    console.log('Looking for existing record:', {
      date: date,
      dateObj: dateObj,
      startOfDay: startOfDay,
      endOfDay: endOfDay,
      shiftType: shiftType
    });
    
    let existingRecord = await CashRegistry.findOne({
      date: {
        $gte: startOfDay,
        $lt: endOfDay
      }
    });
    
    console.log('Existing record found:', existingRecord ? {
      id: existingRecord._id,
      shiftType: existingRecord.shiftType,
      openingBalance: existingRecord.openingBalance,
      closingBalance: existingRecord.closingBalance
    } : 'None');
    
    let cashCollected = 0;
    let expenseValue = 0;
    let cashBalance = 0;
    let balanceDifference = 0;
    let onlinePosDifference = 0;
    
    if (shiftType === 'closing') {
      // Get cash collected from sales for the date
      const sales = await Sale.find({
        date: {
          $gte: startOfDay,
          $lt: endOfDay
        },
        paymentMode: 'Cash'
      });
      
      cashCollected = sales.reduce((sum, sale) => sum + sale.netTotal, 0);
      
      // Get expenses for the date
      const expenses = await Expense.find({
        date: {
          $gte: startOfDay,
          $lt: endOfDay
        },
        paymentMode: 'Cash'
      });
      
      expenseValue = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      
      // Calculate cash balance and differences
      const existingOpeningBalance = existingRecord ? existingRecord.openingBalance : 0;
      cashBalance = existingOpeningBalance + cashCollected - expenseValue;
      balanceDifference = totalBalance - cashBalance;
      onlinePosDifference = onlineCash - posCash;
    }
    
    if (existingRecord && existingRecord.shiftType === shiftType) {
      // Update existing record of the same shift type
      if (shiftType === 'opening') {
        existingRecord.openingBalance = totalBalance;
        existingRecord.denominations = denominations;
        existingRecord.notes = notes || existingRecord.notes;
      } else if (shiftType === 'closing') {
        existingRecord.closingBalance = totalBalance;
        existingRecord.closingDenominations = denominations;
        existingRecord.cashCollected = cashCollected;
        existingRecord.expenseValue = expenseValue;
        existingRecord.cashBalance = cashBalance;
        existingRecord.balanceDifference = balanceDifference;
        existingRecord.balanceDifferenceReason = balanceDifference !== 0 ? 'Manual adjustment required' : 'Balanced';
        existingRecord.onlineCash = onlineCash;
        existingRecord.posCash = posCash;
        existingRecord.onlinePosDifference = onlinePosDifference;
        existingRecord.onlineCashDifferenceReason = onlinePosDifference !== 0 ? 'Difference detected' : 'Balanced';
        existingRecord.notes = notes || existingRecord.notes;
      }
      
      await existingRecord.save();
      
      console.log('Record updated successfully:', {
        id: existingRecord._id,
        shiftType: existingRecord.shiftType,
        openingBalance: existingRecord.openingBalance,
        closingBalance: existingRecord.closingBalance,
        denominations: existingRecord.denominations?.length || 0,
        closingDenominations: existingRecord.closingDenominations?.length || 0
      });
      
      const response = {
        success: true,
        message: 'Cash registry entry updated successfully',
        data: existingRecord
      };
      console.log('🟢 Sending update response:', response);
      res.json(response);
    } else {
      // Create new record (use dateObj for consistent storage)
      const cashRegistry = new CashRegistry({
        date: dateObj,
        shiftType,
        createdBy: req.user.name || req.user.email || 'Unknown User',
        userId: req.user.id,
        denominations: shiftType === 'opening' ? denominations : [],
        closingDenominations: shiftType === 'closing' ? denominations : [],
        openingBalance: shiftType === 'opening' ? totalBalance : 0,
        closingBalance: shiftType === 'closing' ? totalBalance : 0,
        cashCollected: shiftType === 'closing' ? cashCollected : 0,
        expenseValue: shiftType === 'closing' ? expenseValue : 0,
        cashBalance: shiftType === 'closing' ? cashBalance : 0,
        balanceDifference: shiftType === 'closing' ? balanceDifference : 0,
        balanceDifferenceReason: shiftType === 'closing' ? (balanceDifference !== 0 ? 'Manual adjustment required' : 'Balanced') : '',
        onlineCash: shiftType === 'closing' ? onlineCash : 0,
        posCash: shiftType === 'closing' ? posCash : 0,
        onlinePosDifference: shiftType === 'closing' ? onlinePosDifference : 0,
        onlineCashDifferenceReason: shiftType === 'closing' ? (onlinePosDifference !== 0 ? 'Difference detected' : 'Balanced') : '',
        notes
      });
      
      await cashRegistry.save();
      const response = {
        success: true,
        message: 'Cash registry entry created successfully',
        data: cashRegistry
      };
      console.log('🟢 Sending success response:', response);
      res.status(201).json(response);
    }
  } catch (error) {
    console.error('Error creating/updating cash registry:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      user: req.user
    });
    
    // Send more detailed error information
    res.status(500).json({ 
      success: false,
      message: 'Internal server error', 
      error: error.message,
      details: {
        shiftType: req.body.shiftType,
        date: req.body.date,
        denominationsCount: req.body.denominations?.length
      }
    });
  }
});

// Update cash registry entry
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      denominations,
      notes,
      closingBalance,
      onlineCash,
      posCash,
      balanceDifferenceReason,
      onlineCashDifferenceReason
    } = req.body;
    
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Only allow updates to certain fields
    const updates = {
      denominations,
      notes,
      balanceDifferenceReason,
      onlineCashDifferenceReason
    };
    
    if (cashRegistry.shiftType === 'closing') {
      updates.closingBalance = closingBalance;
      updates.onlineCash = onlineCash;
      updates.posCash = posCash;
      
      // Recalculate differences
      const cashBalance = cashRegistry.openingBalance + cashRegistry.cashCollected - cashRegistry.expenseValue;
      updates.cashBalance = cashBalance;
      updates.balanceDifference = closingBalance - cashBalance;
      updates.onlinePosDifference = onlineCash - posCash;
    }
    
    const updatedCashRegistry = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    res.json(updatedCashRegistry);
  } catch (error) {
    console.error('Error updating cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Verify and close cash registry entry
router.post('/:id/verify', auth, async (req, res) => {
  try {
    const { verificationNotes, balanceDifferenceReason, onlineCashDifferenceReason } = req.body;
    
    console.log('🔍 DEBUG Verification request:', {
      id: req.params.id,
      verificationNotes,
      balanceDifferenceReason,
      onlineCashDifferenceReason,
      body: req.body
    });
    
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Check if verification is required
    const hasBalanceDifference = cashRegistry.balanceDifference !== 0;
    const hasOnlinePosDifference = cashRegistry.onlinePosDifference !== 0;
    
    if ((hasBalanceDifference || hasOnlinePosDifference) && !verificationNotes) {
      return res.status(400).json({ 
        message: 'Verification notes are required when there are balance differences' 
      });
    }
    
    // Update verification fields
    const updates = {
      isVerified: true,
      verifiedBy: req.user.name,
      verifiedAt: new Date(),
      verificationNotes,
      status: 'verified'
    };
    
    // Update difference reasons if provided
    if (balanceDifferenceReason) {
      updates.balanceDifferenceReason = balanceDifferenceReason;
    }
    if (onlineCashDifferenceReason) {
      updates.onlineCashDifferenceReason = onlineCashDifferenceReason;
    }
    
    const verifiedCashRegistry = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    console.log('🔍 DEBUG Verification result:', {
      id: verifiedCashRegistry._id,
      balanceDifferenceReason: verifiedCashRegistry.balanceDifferenceReason,
      onlineCashDifferenceReason: verifiedCashRegistry.onlineCashDifferenceReason,
      isVerified: verifiedCashRegistry.isVerified
    });
    
    res.json({
      success: true,
      message: 'Cash registry entry verified successfully',
      data: verifiedCashRegistry
    });
  } catch (error) {
    console.error('Error verifying cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete cash registry entry
router.delete('/:id', auth, async (req, res) => {
  try {
    const { shiftType } = req.query; // Get which shift to delete
    const cashRegistry = await CashRegistry.findById(req.params.id);
    
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Verification check removed for now - will implement proper audit controls later
    
    // Check if we're deleting a specific shift or the entire record
    if (shiftType && (shiftType === 'opening' || shiftType === 'closing')) {
      // Partial deletion - only remove the specific shift data
      if (shiftType === 'opening') {
        // Remove opening data
        cashRegistry.openingBalance = 0;
        cashRegistry.denominations = [];
        cashRegistry.shiftType = cashRegistry.closingBalance > 0 ? 'closing' : 'closing';
      } else if (shiftType === 'closing') {
        // Remove closing data
        cashRegistry.closingBalance = 0;
        cashRegistry.closingDenominations = [];
        cashRegistry.cashCollected = 0;
        cashRegistry.expenseValue = 0;
        cashRegistry.cashBalance = 0;
        cashRegistry.balanceDifference = 0;
        cashRegistry.balanceDifferenceReason = '';
        cashRegistry.onlineCash = 0;
        cashRegistry.posCash = 0;
        cashRegistry.onlinePosDifference = 0;
        cashRegistry.onlineCashDifferenceReason = '';
        cashRegistry.shiftType = cashRegistry.openingBalance > 0 ? 'opening' : 'opening';
      }
      
      // If no data left, delete the entire record
      if (cashRegistry.openingBalance === 0 && cashRegistry.closingBalance === 0) {
        await CashRegistry.findByIdAndDelete(req.params.id);
        res.json({ message: `${shiftType} shift data deleted successfully` });
      } else {
        // Update the record with remaining data
        await cashRegistry.save();
        res.json({ 
          message: `${shiftType} shift data deleted successfully`,
          updatedRecord: cashRegistry
        });
      }
    } else {
      // Delete entire record
      await CashRegistry.findByIdAndDelete(req.params.id);
      res.json({ message: 'Cash registry entry deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Test endpoint removed from here (moved to top)

// Get cash registry summary for dashboard
router.get('/summary/dashboard', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get today's opening and closing entries
    const todayEntries = await CashRegistry.find({
      date: { $gte: today, $lt: tomorrow }
    }).sort({ shiftType: 1 });
    
    // Get cash flow data for today
    const todaySales = await Sale.find({
      date: { $gte: today, $lt: tomorrow },
      paymentMode: 'Cash'
    });
    
    const todayExpenses = await Expense.find({
      date: { $gte: today, $lt: tomorrow },
      paymentMode: 'Cash'
    });
    
    const totalCashCollected = todaySales.reduce((sum, sale) => sum + sale.netTotal, 0);
    const totalExpenses = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    // Calculate expected cash balance
    const openingEntry = todayEntries.find(entry => entry.shiftType === 'opening');
    const closingEntry = todayEntries.find(entry => entry.shiftType === 'closing');
    
    const openingBalance = openingEntry ? openingEntry.openingBalance : 0;
    const expectedCashBalance = openingBalance + totalCashCollected - totalExpenses;
    const actualClosingBalance = closingEntry ? closingEntry.closingBalance : 0;
    
    res.json({
      todayEntries: todayEntries.length,
      openingBalance,
      cashCollected: totalCashCollected,
      expenses: totalExpenses,
      expectedCashBalance,
      actualClosingBalance,
      balanceDifference: actualClosingBalance - expectedCashBalance,
      hasOpeningShift: !!openingEntry,
      hasClosingShift: !!closingEntry
    });
  } catch (error) {
    console.error('Error fetching cash registry summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
