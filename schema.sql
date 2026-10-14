-- ==============================================================================
-- InquiryBox Database Schema
-- Table: enquiries
-- Description: Stores customer enquiries submitted to the local business.
-- ==============================================================================

-- Safe to run repeatedly: existing enquiry records are preserved.
CREATE TABLE IF NOT EXISTS enquiries (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    subject VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional index on status to optimize filtering queries
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);

-- Optional index on created_at for sorting by most recent
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at DESC);
