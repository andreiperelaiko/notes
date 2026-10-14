CREATE TABLE notebooks (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE notes (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    content     TEXT         NOT NULL DEFAULT '',
    notebook_id BIGINT       REFERENCES notebooks (id) ON DELETE SET NULL,
    pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX notes_notebook_id_idx ON notes (notebook_id);
CREATE INDEX notes_order_idx ON notes (pinned DESC, updated_at DESC);
