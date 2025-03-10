import {
  getOrCreateDexAmmProtocol,
  getOrCreateFinancialDailySnapshots,
  getOrCreateLiquidityPoolDailySnapshots,
  getOrCreateLiquidityPoolHourlySnapshots,
} from "../common/initializers";
import { BigDecimal, ethereum } from "@graphprotocol/graph-ts";
import { LiquidityPool as LiquidityPoolStore } from "../../generated/schema";

export function updateRevenueSnapshots(
  pool: LiquidityPoolStore,
  supplySideRevenueUSD: BigDecimal,
  protocolSideRevenueUSD: BigDecimal,
  block: ethereum.Block
): void {
  const protocol = getOrCreateDexAmmProtocol();

  const financialMetrics = getOrCreateFinancialDailySnapshots(block);
  const poolDailySnapshot = getOrCreateLiquidityPoolDailySnapshots(
    pool.id,
    block
  );
  const pooltHourlySnapshot = getOrCreateLiquidityPoolHourlySnapshots(
    pool.id,
    block
  );

  const totalRevenueUSD = supplySideRevenueUSD.plus(protocolSideRevenueUSD);

  // SupplySideRevenueUSD Metrics
  protocol.cumulativeSupplySideRevenueUSD = protocol.cumulativeSupplySideRevenueUSD.plus(
    supplySideRevenueUSD
  );
  financialMetrics.dailySupplySideRevenueUSD = financialMetrics.dailySupplySideRevenueUSD.plus(
    supplySideRevenueUSD
  );
  financialMetrics.cumulativeSupplySideRevenueUSD =
    protocol.cumulativeSupplySideRevenueUSD;

  pool.cumulativeSupplySideRevenueUSD = pool.cumulativeSupplySideRevenueUSD.plus(
    supplySideRevenueUSD
  );
  poolDailySnapshot.cumulativeSupplySideRevenueUSD =
    pool.cumulativeSupplySideRevenueUSD;
  poolDailySnapshot.dailySupplySideRevenueUSD = poolDailySnapshot.dailySupplySideRevenueUSD.plus(
    supplySideRevenueUSD
  );
  pooltHourlySnapshot.cumulativeSupplySideRevenueUSD =
    pool.cumulativeSupplySideRevenueUSD;
  pooltHourlySnapshot.hourlySupplySideRevenueUSD = pooltHourlySnapshot.hourlySupplySideRevenueUSD.plus(
    supplySideRevenueUSD
  );

  // ProtocolSideRevenueUSD Metrics
  protocol.cumulativeProtocolSideRevenueUSD = protocol.cumulativeProtocolSideRevenueUSD.plus(
    protocolSideRevenueUSD
  );
  financialMetrics.cumulativeProtocolSideRevenueUSD =
    protocol.cumulativeProtocolSideRevenueUSD;
  financialMetrics.dailyProtocolSideRevenueUSD = financialMetrics.dailyProtocolSideRevenueUSD.plus(
    protocolSideRevenueUSD
  );

  pool.cumulativeProtocolSideRevenueUSD = pool.cumulativeProtocolSideRevenueUSD.plus(
    protocolSideRevenueUSD
  );
  poolDailySnapshot.cumulativeProtocolSideRevenueUSD =
    pool.cumulativeProtocolSideRevenueUSD;
  poolDailySnapshot.dailyProtocolSideRevenueUSD = poolDailySnapshot.dailyProtocolSideRevenueUSD.plus(
    protocolSideRevenueUSD
  );
  pooltHourlySnapshot.cumulativeProtocolSideRevenueUSD =
    pool.cumulativeProtocolSideRevenueUSD;
  pooltHourlySnapshot.hourlyProtocolSideRevenueUSD = pooltHourlySnapshot.hourlyProtocolSideRevenueUSD.plus(
    protocolSideRevenueUSD
  );

  // TotalRevenueUSD Metrics
  protocol.cumulativeTotalRevenueUSD = protocol.cumulativeTotalRevenueUSD.plus(
    totalRevenueUSD
  );
  financialMetrics.cumulativeTotalRevenueUSD =
    protocol.cumulativeTotalRevenueUSD;
  financialMetrics.dailyTotalRevenueUSD = financialMetrics.dailyTotalRevenueUSD.plus(
    totalRevenueUSD
  );

  pool.cumulativeTotalRevenueUSD = pool.cumulativeTotalRevenueUSD.plus(
    totalRevenueUSD
  );
  poolDailySnapshot.cumulativeTotalRevenueUSD = pool.cumulativeTotalRevenueUSD;
  poolDailySnapshot.dailyTotalRevenueUSD = poolDailySnapshot.dailyTotalRevenueUSD.plus(
    totalRevenueUSD
  );
  pooltHourlySnapshot.cumulativeTotalRevenueUSD =
    pool.cumulativeTotalRevenueUSD;
  pooltHourlySnapshot.hourlyTotalRevenueUSD = pooltHourlySnapshot.hourlyTotalRevenueUSD.plus(
    totalRevenueUSD
  );

  pooltHourlySnapshot.save();
  poolDailySnapshot.save();
  financialMetrics.save();
  protocol.save();
  pool.save();
}
