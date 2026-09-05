-- Seed the vendors the product search is built from.
--
-- `vendors` is the input to vendord's scrape task, and nothing seeds it: an
-- empty table means an empty Meilisearch index, with both the scrape and the
-- sync reporting success. So the rows have to ship with the code that needs
-- them, the same way a schema change does.
--
-- Data only -- no schema change, so drizzle's snapshots are unaffected and
-- `db:generate` still reports "No schema changes".
--
-- ON CONFLICT DO NOTHING, not DO UPDATE: this runs once, and if someone has
-- since corrected a hostname by hand that correction should stand.
--
-- Hostnames are the ones that actually serve the storefront API, which is not
-- always the apex -- reduxrobotics.com and copperforge.cc both 404 on
-- /products.json while their shop. subdomains answer. See the vendor table in
-- CLAUDE.md for who is deliberately absent and why.
INSERT INTO vendors (id, name, type, config, hostname) VALUES
  ('wcp',         'WestCoast Products',         'shopify',     '{}', 'wcproducts.com'),
  ('andymark',    'AndyMark',                   'shopify',     '{}', 'www.andymark.com'),
  ('ctre',        'Cross the Road Electronics', 'shopify',     '{}', 'store.ctr-electronics.com'),
  ('thriftybot',  'The Thrifty Bot',            'shopify',     '{}', 'www.thethriftybot.com'),
  ('sds',         'Swerve Drive Specialties',   'shopify',     '{}', 'www.swervedrivespecialties.com'),
  ('armabot',     'Armabot',                    'shopify',     '{}', 'www.armabot.com'),
  ('lastanvil',   'Last Anvil Innovations',     'shopify',     '{}', 'lastanvil.com'),
  ('limelight',   'Limelight Vision',           'shopify',     '{}', 'limelightvision.io'),
  ('redux',       'Redux Robotics',             'shopify',     '{}', 'shop.reduxrobotics.com'),
  ('copperforge', 'Copperforge',                'shopify',     '{}', 'shop.copperforge.cc'),
  ('rev',         'REV Robotics',               'bigcommerce', '{}', 'www.revrobotics.com'),
  ('swyft',       'Swyft Robotics',             'swyft',       '{}', 'swyftrobotics.com')
ON CONFLICT (id) DO NOTHING;
