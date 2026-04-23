import { BalanceRecord, TokenTotalsRecord, WalletTotalsRecord } from "../types";

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "n/a";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function fmtUsd(n: number | null): string {
  if (n === null || n === undefined) return "n/a";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function separator(char = "─", width = 90): string {
  return char.repeat(width);
}

export function printConsoleSummary(
  records: BalanceRecord[],
  walletTotals: WalletTotalsRecord[],
  tokenTotals: TokenTotalsRecord[],
): void {
  const years = [...new Set(records.map((r) => r.year))].sort();

  console.log("\n" + separator("═"));
  console.log("  WALLET BALANCE SNAPSHOT REPORT");
  console.log(separator("═"));

  for (const year of years) {
    const yearRecords = records.filter((r) => r.year === year);
    const wallets = [...new Set(yearRecords.map((r) => r.walletName))];

    console.log(`\n  Year: ${year}  (snapshot date: ${year}-12-31)`);
    console.log(separator());

    for (const walletName of wallets) {
      const walletRecords = yearRecords.filter((r) => r.walletName === walletName);
      const chains = [...new Set(walletRecords.map((r) => r.chain))];

      console.log(`\n  Wallet: ${walletName}`);
      console.log(`  Address: ${walletRecords[0]?.walletAddress ?? ""}`);

      for (const chain of chains) {
        const chainRecords = walletRecords.filter((r) => r.chain === chain && r.balance > 0);
        if (chainRecords.length === 0) continue;

        console.log(`\n    Chain: ${chain}`);
        for (const r of chainRecords) {
          const tokenLabel = `${r.tokenSymbol.padEnd(6)} (${r.tokenType})`;
          console.log(
            `      ${tokenLabel.padEnd(18)} balance: ${fmt(r.balance).padStart(18)}   USD: ${fmtUsd(r.usdValue).padStart(14)}`,
          );
        }
      }

      const walletTotal = walletTotals.find(
        (t) => t.year === year && t.walletAddress === walletRecords[0]?.walletAddress,
      );
      if (walletTotal) {
        console.log(`\n    Total USD value: ${fmtUsd(walletTotal.totalUsdValue)}`);
      }
    }

    console.log("\n" + separator());
    console.log(`  Token totals for ${year}:`);
    const yearTokenTotals = tokenTotals.filter((t) => t.year === year);
    for (const t of yearTokenTotals) {
      if (t.totalBalance === 0) continue;
      console.log(
        `    ${t.tokenSymbol.padEnd(8)} total balance: ${fmt(t.totalBalance).padStart(20)}   total USD: ${fmtUsd(t.totalUsdValue).padStart(14)}`,
      );
    }
  }

  console.log("\n" + separator("═") + "\n");
}
