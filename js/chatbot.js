import { app, auth } from "./firebase-init.js";

// Try to initialize AI, but gracefully handle if AI service is not available
let model = null;
let aiEnabled = false;

try {
  // Switch to official Google Generative AI SDK for Gemini Developer AP
  const { GoogleGenerativeAI } = await import("https://esm.run/@google/generative-ai");

  // IMPORTANT: Replace YOUR_API_KEY with your actual API key from Google AI Studio
  const ai = new GoogleGenerativeAI("AIzaSyA5m9Amuu7FZeDB0hWVeCAcNmjVs4bvNOk");
  model = ai.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  aiEnabled = true;
  console.log('AI service initialized successfully using Gemini Developer API');
} catch (error) {
  console.warn('AI service not available, falling back to Dialogflow only:', error.message);
}

// Function to generate content using Gemini (exported for potential use elsewhere)
export async function generateGeminiResponse(prompt) {
  if (!aiEnabled || !model) {
    throw new Error('AI service not available');
  }
  
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
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
      // Send to Gemini for general conversation, fallback to Dialogflow if AI unavailable
      if (aiEnabled) {
        await sendMessageToGemini(message);
      } else {
        // Fallback to Dialogflow for general conversation when AI is not available
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
    // Call Dialogflow API endpoint
    const response = await fetch('https://frontendapichatbot.vercel.app/api/dialogflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId })
    });
    const data = await response.json();

    // Remove loading indicator and show AI response
    messages.removeChild(messages.lastChild);
    addMessage('bot', data.reply || 'Sorry, no reply.');
  } catch (err) {
    // Error handling: Show error message if API fails
    messages.removeChild(messages.lastChild);
    addMessage('bot', 'Error connecting to Dialogflow.');
  }
}

/* SEND TO GEMINI: Use Firebase AI for general conversation */
async function sendMessageToGemini(message) {
  if (!aiEnabled || !model) {
    // If AI is not available, inform user and route to Dialogflow instead
    messages.removeChild(messages.lastChild);
    addMessage('bot', 'AI service is currently unavailable. Please use "/" prefix for commands (e.g., /add class) or try again later.');
    return;
  }

  try {
    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    // Remove loading indicator and show AI response
    messages.removeChild(messages.lastChild);
    addMessage('bot', text);
  } catch (err) {
    // Error handling
    messages.removeChild(messages.lastChild);
    addMessage('bot', 'Error connecting to Gemini AI.');
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
}
