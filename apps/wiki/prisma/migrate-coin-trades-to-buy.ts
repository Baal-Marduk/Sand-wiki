import { PrismaClient } from "@prisma/client";
import { convertCoinTradesToBuyLinks } from "./buy-migration";
import { CURRENCY_SLUG } from "../src/lib/trades";

const prisma = new PrismaClient();

async function main() {
  const result = await convertCoinTradesToBuyLinks(prisma, { currencySlug: CURRENCY_SLUG });
  console.log("Coin-trade -> buy-option migration complete:", result);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
