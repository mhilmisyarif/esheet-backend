# e-Sheet Backend API

This is the official backend server for the e-Sheet (Electronic Datasheet) system. It is a Node.js/Express API designed to manage and digitize the entire workflow for laboratory testing, from order creation to final report generation.

This system replaces a manual, paper-based process, providing a robust, role-based, and auditable solution. It is built to support the e-sheet frontend.

## 🚀 Key Features

- **Authentication:** Full JWT (JSON Web Token) authentication for user login and registration.
- **Role-Based Access Control (RBAC):** Differentiates between **Technicians**, **Engineers**, and **Admins**, with specific permissions for each role.
- **Hybrid Database Model:** Uses PostgreSQL and Prisma, leveraging relational tables for structured data (Users, Orders, Samples) and `JSONB` for storing flexible, complex e-sheet data (the test clauses).
- **Dynamic Report Creation:** Supports both "Full" and "Verification" testing types, dynamically filtering test clauses on creation.
- **Workflow Engine:** A full approval workflow (`DRAFT` -\> `SUBMITTED` -\> `APPROVED` / `REJECTED`) managed via protected API endpoints.
- **File & Image Uploads:** Handles `multipart/form-data` uploads using `multer` for attaching test images and photos to reports.
- **Server-Side DOCX Generation:** Generates complex, formatted `.docx` reports (based on the `1. LED SWA-BALAST CKLB 13W.docx` template) on the fly using the `docx` library.
- **Smart Order Parsing:** Automatically detects the correct laboratory from an order number.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** `jsonwebtoken` (JWT), `bcryptjs` (hashing)
- **File Uploads:** `multer`
- **Document Generation:** `docx`
- **Middleware:** `cors`

---

## ⚙️ Setup & Installation

### 1\. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [PostgreSQL](https://www.postgresql.org/) database server

### 2\. Installation

1.  **Clone the repository** (if you haven't):

    ```bash
    git clone [your-github-repo-url]
    cd esheet-backend
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

### 3\. Database & Environment Setup

1.  **Create a `.env` file** in the root of the project. Copy the contents of `.env.example` (if you have one) or use the template below.

2.  **Edit your `.env` file:**

    ```.env
    # 1. Your PostgreSQL connection string
    DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/esheet_db?schema=public"

    # 2. Your secret for signing JWTs (make this long and random)
    JWT_SECRET="your-very-strong-and-secret-key-goes-here"

    # 3. The port your server will run on
    PORT=5000
    ```

3.  **Run database migrations:**
    This command reads your `prisma/schema.prisma` file and creates all the necessary tables in your database.

    ```bash
    npx prisma migrate dev
    ```

4.  **Seed the database:**
    This populates your database with initial data (labs, test standards, and a default user) from `prisma/seed.js`.

    ```bash
    npx prisma db seed
    ```

### 4\. Running the Application

1.  **Run in development mode:**
    This uses `nodemon` to automatically restart the server when you make changes.

    ```bash
    npm run dev
    ```

2.  **Run in production mode:**

    ```bash
    npm start
    ```

The server will be running at `http://localhost:5000`.

---

## 🌎 API Endpoints Overview

All routes are prefixed with `/api`.

### Auth

- `POST /auth/register`: Creates a new user.
- `POST /auth/login`: Logs in a user and returns a JWT.

### Dashboards

- `GET /samples`: Fetches all samples. Can be filtered (e.g., `GET /samples?status=SUBMITTED`) for dashboards.
- `GET /labs`: Fetches all labs and their available `TestStandards`.

### Report Workflow

- `POST /workflow/create-report`: (Protected) The main endpoint for creating a new Order, Sample, and Report in one transaction.
- `GET /reports/by-sample/:sampleId`: (Protected) Gets the full report data (including `JSONB`) for the editor page.
- `PATCH /reports/:id/data`: (Protected) The "autosave" endpoint. Receives the entire `data` JSON blob and updates it.
- `POST /reports/:id/submit`: (Protected) Submits a `DRAFT` report for review.
- `POST /reports/:id/approve`: (Protected: Engineer) Approves a `SUBMITTED` report.
- `POST /reports/:id/reject`: (Protected: Engineer) Rejects a `SUBMITTED` report and sends it back to `DRAFT`.
- `GET /reports/:id/download`: (Protected) Generates and downloads the final `.docx` report.

### Uploads

- `POST /uploads/report-image/:reportId`: (Protected) Uploads a single image for a report.
- `DELETE /uploads/image/:imageId`: (Protected) Deletes an image.
- `PATCH /uploads/image/:imageId`: (Protected) Updates an image's caption.
