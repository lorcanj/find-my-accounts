console.log('Service worker started');

chrome.identity.getAuthToken({ interactive: true }, function(token) {
  console.log('OAuth token:', token);
});