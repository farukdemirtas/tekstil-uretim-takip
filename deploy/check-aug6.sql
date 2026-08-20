.mode column
.headers on

SELECT id, product_name, model_code, utu_paket_session_start_date
FROM product_models WHERE id IN (20, 23);

SELECT production_date, model_id, product_name, product_model, packaging_target
FROM utu_paket_meta
WHERE production_date BETWEEN '2026-08-04' AND '2026-08-07'
ORDER BY production_date;

SELECT s.production_date, s.stage,
  s.h0900+s.h1000+s.h1115+s.h1215+s.h1300+s.h1445+s.h1545+s.h1700+s.h1830+s.ek_sayim AS total
FROM utu_paket_slots s
WHERE s.production_date BETWEEN '2026-08-04' AND '2026-08-07'
ORDER BY s.production_date, s.stage;

SELECT production_date, size_code, count FROM utu_paket_beden
WHERE production_date BETWEEN '2026-08-04' AND '2026-08-07'
ORDER BY production_date, size_code;

