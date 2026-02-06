# EdUrl: easy URL Shortener

A simple, fast, and secure URL shortener service built with Node.js, Express, and Turso (cloud SQLite). Created by [Eduard Vallvé](https://eduvallve.com).

## Features

- **Instant Shortening**: Turn long URLs into compact, shareable links
- **Deduplication**: Same URL always returns the same short code
- **Redirection**: Seamlessly redirects visitors from the short link to the original destination
- **Cloud Storage**: Uses Turso database for persistent, globally accessible storage
- **Modern UI**: Clean, responsive web interface with mobile-first design
- **Serverless Ready**: Optimized for Vercel deployment
- **Privacy Focused**: No personal data stored, only URLs and basic statistics

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
    DATABASE_URL=your_turso_database_url
    BASE_URL=https://your-domain.com

    SMTP_HOST=smtp.example.com
    SMTP_PORT=587
    SMTP_USER=your_email
    SMTP_PASS=your_password
    ADMIN_EMAIL=your_admin_email
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

1.  **Deploy to Vercel**:
    ```bash
    vercel
    ```
    Or connect your GitHub repository in the Vercel dashboard.

2.  **Configure environment variables in Vercel**:
    - Go to your Vercel project dashboard
    - Navigate to Settings → Environment Variables
    - Add the following variables for all environments (Production, Preview, Development):
      - `TURSO_DATABASE_URL`: Your Turso database URL
      - `TURSO_AUTH_TOKEN`: Your Turso authentication token
      - `DATABASE_URL`: Your Turso database URL
      - `BASE_URL`: Your domain name
      - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Your email provider settings
      - `ADMIN_EMAIL`: The email address where you want to receive abuse reports

3.  **Redeploy** if you added variables after initial deployment.


## Privacy & Terms

By using this service, you agree to:
- **Privacy**: We do not store any personal data. Only shortened URLs and their statistics are stored.
- **Terms**: 
  - This is a free service provided by Eduard Vallvé
  - We are not responsible for the content of shortened URLs
  - Database hosted on Turso

## License

MIT License

## Credits

- **Created by**: [Eduard Vallvé](https://eduvallve.com)
- **Database**: [Turso](https://turso.tech)
- **Hosting**: Vercel
- **Development**: Built with AI assistance
