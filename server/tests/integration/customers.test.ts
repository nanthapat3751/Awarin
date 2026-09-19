import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("customers module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-customers-owner");
    createdUserIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("finds a customer by searching part of their email", async () => {
    const customer = await createAndLoginCustomer("test-customers-search");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(user.id);

    const res = await owner.agent.get(`/api/customers?q=${encodeURIComponent(customer.email.slice(0, 15))}`);
    expect(res.status).toBe(200);
    expect(res.body.customers.some((c: { id: string }) => c.id === user.id)).toBe(true);
  });

  it("rejects a CUSTOMER from searching customers", async () => {
    const customer = await createAndLoginCustomer("test-customers-forbidden");
    const res = await customer.agent.get("/api/customers");
    expect(res.status).toBe(403);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.status).toBe(401);
  });

  it("assigns a customer to a project, and the assignment shows up in project reads", async () => {
    const customer = await createAndLoginCustomer("test-customers-assign");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(user.id);

    const createRes = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบผูกลูกค้า" });
    const projectId = createRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const patchRes = await owner.agent
      .patch(`/api/projects/${projectId}`)
      .send({ customerId: user.id });
    expect(patchRes.status).toBe(200);

    const detailRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailRes.body.project.customer).toMatchObject({ id: user.id, email: customer.email });

    const listRes = await owner.agent.get(`/api/projects?customerId=${user.id}`);
    expect(listRes.body.projects.some((p: { id: string }) => p.id === projectId)).toBe(true);

    // ยกเลิกการกำหนด
    const unassignRes = await owner.agent
      .patch(`/api/projects/${projectId}`)
      .send({ customerId: null });
    expect(unassignRes.status).toBe(200);
    const detailAfter = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailAfter.body.project.customer).toBeNull();
  });
});
