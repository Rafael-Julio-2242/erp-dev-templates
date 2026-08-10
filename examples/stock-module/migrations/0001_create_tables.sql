-- Module migrations run inside a transaction managed by erp-core.
-- Schema name must be mod_{slug} — in this case mod_stock.
-- All tables must have: id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL.
CREATE TABLE IF NOT EXISTS mod_stock.products (
    id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid    NOT NULL,
    name        text    NOT NULL,
    sku         text    NOT NULL,
    quantity    integer NOT NULL DEFAULT 0,
    threshold   integer NOT NULL DEFAULT 10,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mod_stock.stock_movements (
    id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid    NOT NULL,
    product_id  uuid    NOT NULL REFERENCES mod_stock.products(id) ON DELETE CASCADE,
    delta       integer NOT NULL,
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
