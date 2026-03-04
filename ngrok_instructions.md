# How to get your ngrok Authtoken

Since you don't have a domain, **ngrok** is the perfect solution. It gives you a free URL (e.g., `https://abc-123.ngrok-free.app`) to access your app.

1. **Sign Up**: Go to [ngrok.com](https://ngrok.com/) and create a free account.
2. **Get your Authtoken**:
   - Once logged in, go to the **Your Authtoken** section on the left sidebar.
   - Click **Copy** to copy your unique token.
3. **Set up a Static Domain (Optional but Recommended)**:
   - Go to **Cloud Edge** -> **Domains**.
   - ngrok gives you **one free static domain** so your URL never changes.
   - Click **Create Domain** and follow the prompts. (Copy this domain too, e.g., `your-name.ngrok-free.app`)
4. **Update your `.env` file**:
   - Add this line: `NGROK_AUTHTOKEN=your_copied_token_here`
   - *If you created a static domain*, also add: `NGROK_DOMAIN=your-domain.ngrok-free.app`

**Send me the Authtoken (and Domain if you made one) once you're ready!**
