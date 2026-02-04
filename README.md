# URL Shortener

A simple, fast, and secure URL shortener service built with Node.js, Express, and Turso (cloud SQLite).

## Features

- **Instant Shortening**: Turn long URLs into compact, shareable links.
- **Deduplication**: Same URL always returns the same short code.
- **Redirection**: Seamlessly redirects visitors from the short link to the original destination.
- **Cloud Storage**: Uses Turso database for persistent, globally accessible storage.
- **Modern UI**: Clean and responsive web interface.
- **Serverless Ready**: Optimized for Vercel deployment.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- npm (Node Package Manager)
- Turso account and database ([turso.tech](https://turso.tech))

## Installation

1.  **Clone the repository** (or download the source code).

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up environment variables**:
    Create a `.env` file in the root directory:
    ```env
    TURSO_DATABASE_URL=your_turso_database_url
    TURSO_AUTH_TOKEN=your_turso_auth_token
    ```

## Local Development

1.  **Start the server**:
    ```bash
    npm start
    ```
    The server will start on port 3000 by default.

2.  **Access the application**:
    Open your browser to [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

1.  **Install Vercel CLI** (optional, for testing):
    ```bash
    npm i -g vercel
    ```

2.  **Deploy to Vercel**:
    ```bash
    vercel
    ```

3.  **Configure environment variables in Vercel**:
    - Go to your Vercel project dashboard
    - Navigate to Settings → Environment Variables
    - Add the following variables:
      - `TURSO_DATABASE_URL`: Your Turso database URL
      - `TURSO_AUTH_TOKEN`: Your Turso authentication token

4.  **Redeploy** if you added variables after initial deployment.

## API Endpoints

-   `POST /api/shorten`: Accepts JSON `{ "originalUrl": "..." }` and returns the shortened URL.
-   `GET /:code`: Redirects to the original URL associated with the short code.

## Project Structure

-   `server.js`: Main Express application (works both locally and on Vercel).
-   `vercel.json`: Vercel deployment configuration.
-   `public/`: Static frontend files (HTML, CSS, JS).
-   `.env`: Environment variables (not committed to git).

## License

MIT License

## Note

This project has been developed using Artificial Intelligence (AI) tools.
This project is for educational purposes only and should not be used for commercial purposes.
