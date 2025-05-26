console.log('Service worker started');

const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1/users/me/messages';

function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (token) resolve(token);
      else reject('No token');
    });
  });
}

async function getMessageIds(token, maxResults = 50) {
  const res = await fetch(`${GMAIL_API_BASE}?maxResults=${maxResults}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  return data.messages || [];
}

async function getMessageDetail(token, id) {
  const res = await fetch(`${GMAIL_API_BASE}/${id}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  return await res.json();
}

// Exported API for other modules
export async function fetchRawMessages(maxResults = 50) {
  try {
    const token = await getAuthToken();
    const messages = await getMessageIds(token, maxResults);
    const details = [];
    for (const msg of messages) {
      const fullMsg = await getMessageDetail(token, msg.id);
      details.push(fullMsg);
    }
    return details; // Array of raw message objects
  } catch (error) {
    console.error('Error fetching Gmail messages:', error);
    throw error;
  }
}