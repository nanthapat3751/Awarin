-- Split HouseDesign.images into exteriorImages/interiorImages so the site can show
-- separate labeled galleries instead of one mixed set of photos.
ALTER TABLE "HouseDesign" ADD COLUMN "exteriorImages" JSONB;
ALTER TABLE "HouseDesign" ADD COLUMN "interiorImages" JSONB;

-- Existing photos were an undifferentiated gallery -- treat them as exterior shots by
-- default (the common case for a single uploaded set) rather than discarding them.
UPDATE "HouseDesign" SET "exteriorImages" = "images" WHERE "images" IS NOT NULL;

ALTER TABLE "HouseDesign" DROP COLUMN "images";
