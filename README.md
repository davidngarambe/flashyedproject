**FlashyEd Setup Guide**

**Prerequisites**
  - Node.js (v18 or higher)
  - npm (comes with Node.js)
  - Supabase Account (Free tier works perfectly)
  - Anthropic API Key (For Claude AI)

**Clone the repo**
In the VScode terminal inside the directory you want. Paste this line -> git clone https://github.com/davidngarambe/flashyed

**Configure Environment Variables**
Create a .env file and paste inside these lines of code:

SUPABASE_DB_URL=postgresql://postgres.mjuskppzgumldunazixl:Calculus11%40%21%21%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres

ANTHROPIC_KEY=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

PORT=3001

**Install & Run**
Open the VScode terminal and the do the following:
  1. Install the necessary dependencies: npm install
  2. Start the server: npm start
  3. Open your browser and navigate to: http://localhost:3001
     
**First Use**
  - On the landing page, click "Sign Up" to create a new account.
  - Once logged in, go to the "Generate" tab.
  - Paste some text or upload a PDF.
  - Click "Generate Flashcards"—the AI will process the text and automatically save the results to your library.
  - Click on Quiz to do a quiz on the lecture notes you uploaded
