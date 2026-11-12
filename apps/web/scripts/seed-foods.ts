// Adds the starter food library (about 60 common foods, USDA values per
// 100 g) to the database in DATABASE_URL. Safe to re-run: foods that are
// already there, archived ones included, are skipped and never changed.
//   pnpm db:seed-foods
import { db } from "@/db";
import { insertMissingSeedFoods } from "@/features/foods/services/seed-foods-service";

const seedFoods = async () => {
  const added = await insertMissingSeedFoods(db);

  console.log(
    added
      ? `✔ Đã thêm ${added} món vào thư viện thực phẩm`
      : "▸ Thư viện thực phẩm đã đủ món, không thêm gì",
  );
};

seedFoods().catch((error) => {
  console.error("✖ Thêm thực phẩm thất bại:", error);
  process.exit(1);
});
