const express = require('express');
const { logger } = require('../utils/logger');
const { setupMainDatabase } = require('../middleware/business-db');
const { serializeMatrixDocument } = require('../lib/public-pricing-matrix-service');

const router = express.Router();

/** GET /api/public/pricing-matrix — public pricing page feature matrix */
router.get('/', setupMainDatabase, async (req, res) => {
  try {
    const { PublicPricingMatrix } = req.mainModels;
    const doc = await PublicPricingMatrix.getMatrixDocument();
    res.json({
      success: true,
      data: serializeMatrixDocument(doc),
    });
  } catch (error) {
    logger.error('Error fetching public pricing matrix:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing matrix',
    });
  }
});

module.exports = router;
