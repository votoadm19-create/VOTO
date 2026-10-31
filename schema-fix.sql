-- Corrige o tipo e os padrões dos produtos
ALTER TABLE products
    ALTER COLUMN v TYPE INTEGER USING NULLIF(v, '')::INTEGER,
    ALTER COLUMN v SET DEFAULT 0,
    ALTER COLUMN v SET NOT NULL;

ALTER TABLE products
    ALTER COLUMN cat SET NOT NULL,
    ALTER COLUMN art SET DEFAULT 'kit',
    ALTER COLUMN art SET NOT NULL,
    ALTER COLUMN cor SET DEFAULT '#e2561c',
    ALTER COLUMN cor SET NOT NULL;

-- Preserva o status padrão dos pedidos
ALTER TABLE orders
    ALTER COLUMN status SET DEFAULT 'novo',
    ALTER COLUMN status SET NOT NULL;

-- Preserva a obrigatoriedade das configurações
ALTER TABLE settings
    ALTER COLUMN valor SET NOT NULL;
