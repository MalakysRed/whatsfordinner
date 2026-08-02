-- New Haiku-backed generation call added by the builder redesign: options for
-- "The Plate" (complex carb / healthy fat / veg-and-fruit) offered between the
-- flavour profile step and the flavour layer step.
alter type generation_type add value if not exists 'plate';
