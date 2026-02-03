# ShortLink (Astral Sagan)

A simple, fast, and secure URL shortener service built with Node.js, Express, and SQLite.

## Features

- **Instant Shortening**: Turn long URLs into compact, shareable links.
- **Redirection**: Seamlessly redirects visitors from the short link to the original destination.
- **Persistent Storage**: Uses SQLite to store URL mappings reliably.
- **Modern UI**: Clean and responsive web interface.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- npm (Node Package Manager)

## Installation

1.  **Clone the repository** (or download the source code).

2.  **Install dependencies**:
    Navigate to the project directory and run:
    ```bash
    npm install
    ```

## Usage

1.  **Start the server**:
    ```bash
    npm start
    ```
    The server will start on port 3000 by default (or the port specified in `PORT` environment variable).

2.  **Access the application**:
    Open your web browser and go to:
    [http://localhost:3000](http://localhost:3000)

## API Endpoints

-   `POST /api/shorten`: Accepts a JSON body `{ "originalUrl": "..." }` and returns the shortened URL.
-   `GET /:code`: Redirects to the original URL associated with the short code.

## Project Structure

-   `server.js`: Main application entry point. Sets up Express and SQLite.
-   `public/`: Contains static frontend files (HTML, CSS, JS).
-   `urls.db`: The SQLite database file (created automatically upon first run).

## License

MIT License

## Note

This project has been developed using Artificial Intelligence (AI) tools.
This project is for educational purposes only and should not be used for commercial purposes.

