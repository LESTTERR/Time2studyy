import { app, auth } from "./firebase-init.js";

// Function to generate content using Gemini via Vercel API (exported for potential use elsewhere)
export async function generateGeminiResponse(prompt) {
  try {
    const response = await fetch('https://frontendapichatbot.vercel.app/api/gemini', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data.reply;
  } catch (error) {
    console.error('Error generating Gemini response:', error);
    throw new Error('Failed to generate response from Gemini');
  }
}

// DOM elements for chatbot UI
const fab = document.getElementById('chatbot-fab');
const chatWindow = document.getElementById('chatbot-window');
const closeBtn = document.getElementById('chatbot-close');
const sendBtn = document.getElementById('chatbot-send');
const input = document.getElementById('userInput');
const messages = document.getElementById('messages');

// Debug message logging - Reduced frequency
let debugMessageCount = 0;
function debugLog(message) {
  debugMessageCount++;
  // Only log every 10th message to reduce console spam
  if (debugMessageCount % 10 === 0) {
    console.log(`🔍 [AskAI Debug] ${message}`);
  }
}

/* Show chatbot window: Click FAB to open chat */
fab.onclick = () => {
  chatWindow.style.display = 'flex';
  fab.style.display = 'none';
  input.focus();
  // Show welcome message if no previous messages
  if (messages.children.length === 0) {
    showWelcomeMessage();
  }
};

/* Show welcome message with slash command examples */
function showWelcomeMessage() {
  addMessage('bot', 'Hello! I\'m your study assistant. You can use slash commands for quick actions:');
  setTimeout(() => {
    addMessage('bot', '• /add class - Add a new class');
    setTimeout(() => {
      addMessage('bot', '• /add task - Add a new task');
      setTimeout(() => {
        addMessage('bot', '• /help - See all available commands');
        setTimeout(() => {
          addMessage('bot', 'Or just chat with me naturally! 😊');
        }, 800);
      }, 800);
    }, 800);
  }, 800);
}

/* Hide chatbot window: Click close button */
closeBtn.onclick = () => {
  chatWindow.style.display = 'none';
  fab.style.display = 'flex';
};

/* Send message on button click OR Enter key */
sendBtn.onclick = sendMessage;
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

/* Enhanced event handling to prevent touch event issues */
function preventDefaultTouchScroll(e) {
  if (e.cancelable) {
    e.preventDefault();
  }
}

// Add touch event listeners with proper scrolling handling
input.addEventListener('touchstart', preventDefaultTouchScroll, { passive: false });
input.addEventListener('touchmove', preventDefaultTouchScroll, { passive: false });

/* SEND MESSAGE: Process user input and route to appropriate AI */
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  
  // Add user message to chat
  addMessage('user', text);
  input.value = '';
  
  // Disable input while processing
  input.disabled = true;
  sendBtn.disabled = true;
  
  // Route to appropriate AI service
  await sendMessageToAI(text);
  
  // Re-enable input
  input.disabled = false;
  sendBtn.disabled = false;
  input.focus();
}

/* SEND TO AI: Route to Dialogflow or Gemini based on message */
async function sendMessageToAI(message) {
  // Show loading indicator
  addMessage('bot', '...');

  try {
    if (message.startsWith('/')) {
      // Handle help command locally
      if (message.toLowerCase() === '/help') {
        messages.removeChild(messages.lastChild);
        showHelpMessage();
        return;
      }
      
      // Send other slash commands to Dialogflow for CRUD operations
      await sendMessageToDialogflow(message);
    } else {
      // Send to Gemini via Vercel API for general conversation, fallback to Dialogflow if API fails
      try {
        await sendMessageToGemini(message);
      } catch (err) {
        // Fallback to Dialogflow for general conversation when Gemini API is not available
        await sendMessageToDialogflow(message);
      }
    }
  } catch (err) {
    // Error handling
    messages.removeChild(messages.lastChild);
    addMessage('bot', 'Error processing your message.');
  }
}

/* Show help message with available slash commands */
function showHelpMessage() {
  addMessage('bot', '📚 Available Slash Commands:');
  setTimeout(() => {
    addMessage('bot', '• /add class [name] - Add a new class');
    setTimeout(() => {
      addMessage('bot', '• /add task [name] - Add a new task');
      setTimeout(() => {
        addMessage('bot', '• /list classes - View all your classes');
        setTimeout(() => {
          addMessage('bot', '• /list tasks - View all your tasks');
          setTimeout(() => {
            addMessage('bot', '• /delete class [name] - Delete a class');
            setTimeout(() => {
              addMessage('bot', '• /delete task [name] - Delete a task');
              setTimeout(() => {
                addMessage('bot', 'You can also chat with me naturally! Just type your question or request.');
              }, 600);
            }, 600);
          }, 600);
        }, 600);
      }, 600);
    }, 600);
  }, 600);
}

/* SEND TO DIALOGFLOW: Call API endpoint with user message */
async function sendMessageToDialogflow(message) {
  // Use Firebase user ID for session tracking, or 'guest' if logged out
  const sessionId = auth.currentUser ? auth.currentUser.uid : 'guest';

  try {
    // Call Dialogflow API endpoint with proper CORS handling
    const response = await fetch('https://frontendapichatbot.vercel.app/api/dialogflow', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, sessionId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();

    // Remove loading indicator and show AI response
    messages.removeChild(messages.lastChild);
    addMessage('bot', data.reply || 'Sorry, no reply.');
  } catch (err) {
    // Error handling: Show error message if API fails
    messages.removeChild(messages.lastChild);
    console.error('Dialogflow API Error:', err);
    addMessage('bot', 'I\'m having trouble connecting right now. Please try again later.');
  }
}

/* SEND TO GEMINI: Use Vercel API for general conversation */
async function sendMessageToGemini(message) {
  try {
    const response = await fetch('https://frontendapichatbot.vercel.app/api/gemini', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: message })
    });

    if (!response.ok) {
      // Check for CORS errors specifically
      if (response.status === 0 || response.status === 'ERR_FAILED') {
        throw new Error('CORS_ORIGIN_BLOCKED');
      }
      const errorData = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Remove loading indicator and show AI response
    messages.removeChild(messages.lastChild);
    addMessage('bot', data.reply);
  } catch (err) {
    // Error handling
    messages.removeChild(messages.lastChild);
    console.error('Gemini API Error:', err);
    
    // Provide specific error messages for different scenarios
    if (err.message === 'CORS_ORIGIN_BLOCKED') {
      addMessage('bot', '🔧 Chatbot service is temporarily unavailable due to server configuration. Please try again later or contact support.');
    } else if (err.message.includes('Failed to fetch')) {
      addMessage('bot', '🌐 I\'m having trouble reaching my AI brain. Please check your internet connection and try again.');
    } else {
      addMessage('bot', 'I\'m having trouble connecting to my AI brain right now. Please try again in a moment.');
    }
  }
}

/* ADD MESSAGE: Append message to chat (user or bot) */
function addMessage(sender, text) {
  const msg = document.createElement('div');

  // Apply CSS class based on sender (user vs bot)
  if (sender === 'user') {
    msg.className = 'user-message';
  } else {
    msg.className = 'bot-message';
  }

  // Set message text content
  msg.textContent = text;
  messages.appendChild(msg);

  // Auto-scroll to bottom of messages
  messages.scrollTop = messages.scrollHeight;
  
  // Debug logging (reduced frequency)
  debugLog(`_msgList length: ${messages.children.length}`);
}