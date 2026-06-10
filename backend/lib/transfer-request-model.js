function getTransferRequestModel(conn) {
  if (conn.models.TransferRequest) return conn.models.TransferRequest;
  return conn.model('TransferRequest', require('../models/TransferRequest').schema);
}

module.exports = { getTransferRequestModel };
