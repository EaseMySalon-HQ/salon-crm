const mongoose = require('mongoose');

const packageServiceSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  package_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true
  },
  service_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  is_optional: {
    type: Boolean,
    default: false   // false = always included, true = client picks (CUSTOMIZED packages)
  },
  tag: {
    type: String,
    trim: true       // category label e.g. "Hair", "Skin"
  }
}, {
  timestamps: true
});

packageServiceSchema.index({ branchId: 1, package_id: 1 });
packageServiceSchema.index({ branchId: 1, service_id: 1 });

module.exports = {
  schema: packageServiceSchema,
  model: mongoose.model('PackageService', packageServiceSchema)
};
