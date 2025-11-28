  
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
    };

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

    /* SEND MESSAGE: Process user input and send to Dialogflow API */
    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      
      // Add user message to chat
      addMessage('user', text);
      input.value = '';
      
      // Disable input while processing
      input.disabled = true;
      sendBtn.disabled = true;
      
      // Send to Dialogflow AI backend
      await sendMessageToDialogflow(text);
      
      // Re-enable input
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }

    /* SEND TO DIALOGFLOW: Call API endpoint with user message */
    async function sendMessageToDialogflow(message) {
      // Use Firebase user ID for session tracking, or 'guest' if logged out
      const sessionId = auth.currentUser ? auth.currentUser.uid : 'guest';
      
      // Show loading indicator
      addMessage('bot', '...');
      
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
        addMessage('bot', 'Error connecting to server.');
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

