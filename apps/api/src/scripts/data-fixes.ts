import { type DataSource, IsNull } from "typeorm";

import { Admin } from "../database/entities/admin.entity.js";

// One-time data fixes the web ran from its setup script. They are idempotent,
// so the cutover can run them on the migrated data and a re-run changes nothing.

// P1: admins that existed before roles (role null = super admin) get an
// explicit super_admin role and the blue tick, once. Setting the role marks the
// row as migrated, so a tick the super admin removes later is not granted
// again. PT accounts always have a role and are left alone. Returns how many
// rows changed.
export const verifyExistingSuperAdmins = async (
  dataSource: DataSource,
  now: Date = new Date(),
) => {
  const result = await dataSource
    .getRepository(Admin)
    .update({ role: IsNull() }, { role: "super_admin", verifiedAt: now });

  return result.affected ?? 0;
};
