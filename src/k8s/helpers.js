function getK8sErrorMessage(error) {
  return (
    error?.body?.message ||
    error?.response?.body?.message ||
    error?.message ||
    "Unknown K8s error"
  );
}

function isNotFound(error) {
  return error?.code === 404 || error?.statusCode === 404 || error?.response?.statusCode === 404;
}

function listItems(response) {
  return response?.items || [];
}

module.exports = {
  getK8sErrorMessage,
  isNotFound,
  listItems
};
