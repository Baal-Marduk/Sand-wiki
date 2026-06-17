import { PrismaClient } from "@prisma/client";
import { extractTechUnlocksToBuyOptions } from "./tech-unlock-extract";

const prisma = new PrismaClient();

async function main() {
  const result = await extractTechUnlocksToBuyOptions(prisma);
  console.log("Tech-unlock -> buy-option extraction complete:", result);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
