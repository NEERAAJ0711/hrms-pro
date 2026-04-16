import { db } from "./db";
import { users, leaveTypes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function seedDefaultData() {
  const existingAdmin = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  
  if (existingAdmin.length === 0) {
    await db.insert(users).values({
      id: randomUUID(),
      username: "admin",
      email: "admin@hrms.com",
      password: "admin123",
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      companyId: null,
      status: "active",
      lastLogin: null,
    });
    console.log("Default admin user created (admin/admin123)");
  }

  const existingLeaveTypes = await db.select().from(leaveTypes).limit(1);
  
  if (existingLeaveTypes.length === 0) {
    const defaultLeaveTypes = [
      { name: "Casual Leave", code: "CL", daysPerYear: 12, carryForward: false, maxCarryForward: 0 },
      { name: "Sick Leave", code: "SL", daysPerYear: 12, carryForward: true, maxCarryForward: 6 },
      { name: "Privilege Leave", code: "PL", daysPerYear: 15, carryForward: true, maxCarryForward: 30 },
      { name: "Maternity Leave", code: "ML", daysPerYear: 182, carryForward: false, maxCarryForward: 0 },
      { name: "Paternity Leave", code: "PTL", daysPerYear: 15, carryForward: false, maxCarryForward: 0 },
    ];

    for (const lt of defaultLeaveTypes) {
      await db.insert(leaveTypes).values({
        id: randomUUID(),
        companyId: null,
        name: lt.name,
        code: lt.code,
        daysPerYear: lt.daysPerYear,
        carryForward: lt.carryForward,
        maxCarryForward: lt.maxCarryForward,
        description: null,
        status: "active",
      });
    }
    console.log("Default leave types created");
  }
}
