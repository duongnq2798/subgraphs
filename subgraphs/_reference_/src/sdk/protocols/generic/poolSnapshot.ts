import {
  Pool as PoolSchema,
  PoolDailySnapshot,
  PoolHourlySnapshot,
} from "../../../../generated/schema";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from "../../util/constants";
import { CustomEventType, getUnixDays, getUnixHours } from "../../util/events";

export class PoolSnapshot {
  pool: PoolSchema;
  event: CustomEventType;
  dayID: i32;
  hourID: i32;

  constructor(pool: PoolSchema, event: CustomEventType) {
    this.pool = pool;
    this.event = event;
    this.dayID = getUnixDays(event.block);
    this.hourID = getUnixHours(event.block);
    this.takeSnapshots();
  }

  private takeSnapshots(): void {
    if (!this.isInitialized()) {
      return;
    }

    const snapshotDayID =
      this.pool.lastUpdateTimestamp.toI32() / SECONDS_PER_DAY;
    const snapshotHourID =
      this.pool.lastUpdateTimestamp.toI32() / SECONDS_PER_HOUR;

    if (snapshotDayID != this.dayID) {
      this.takeDailySnapshot(snapshotDayID);
      this.pool.lastSnapshotDayID = snapshotDayID;
      this.pool.save();
    }

    if (snapshotHourID != this.hourID) {
      this.takeHourlySnapshot(snapshotHourID);
      this.pool.lastSnapshotHourID = snapshotHourID;
      this.pool.save();
    }
  }

  private isInitialized(): boolean {
    return this.pool.lastSnapshotDayID && this.pool.lastSnapshotHourID;
  }

  private takeHourlySnapshot(hour: i32): void {
    const snapshot = new PoolHourlySnapshot(this.pool.id.concatI32(hour));
    const previousSnapshot = PoolHourlySnapshot.load(
      this.pool.id.concatI32(this.pool.lastSnapshotHourID)
    );

    snapshot.hour = hour;
    snapshot.protocol = this.pool.protocol;
    snapshot.pool = this.pool.id;
    snapshot.timestamp = this.event.block.timestamp;
    snapshot.blockNumber = this.event.block.number;

    // tvl and balances
    snapshot.totalValueLockedUSD = this.pool.totalValueLockedUSD;
    snapshot.inputTokenBalance = this.pool.inputTokenBalance;
    snapshot.totalLiquidity = this.pool.totalLiquidity;
    snapshot.totalLiquidityUSD = this.pool.totalLiquidityUSD;
    snapshot.stakedLiquidity = this.pool.stakedLiquidity;
    snapshot.rewardTokenEmissions = this.pool.rewardTokenEmissions;
    snapshot.rewardTokenEmissionsUSD = this.pool.rewardTokenEmissionsUSD;

    // revenues
    snapshot.cumulativeSupplySideRevenueUSD =
      this.pool.cumulativeSupplySideRevenueUSD;
    snapshot.cumulativeProtocolSideRevenueUSD =
      this.pool.cumulativeProtocolSideRevenueUSD;
    snapshot.cumulativeTotalRevenueUSD = this.pool.cumulativeTotalRevenueUSD;

    // deltas
    let supplySideRevenueDelta = snapshot.cumulativeSupplySideRevenueUSD;
    let protocolSideRevenueDelta = snapshot.cumulativeProtocolSideRevenueUSD;
    let totalRevenueDelta = snapshot.cumulativeTotalRevenueUSD;

    if (previousSnapshot) {
      supplySideRevenueDelta = snapshot.cumulativeSupplySideRevenueUSD.minus(
        previousSnapshot.cumulativeSupplySideRevenueUSD
      );
      protocolSideRevenueDelta =
        snapshot.cumulativeProtocolSideRevenueUSD.minus(
          previousSnapshot.cumulativeProtocolSideRevenueUSD
        );
      totalRevenueDelta = snapshot.cumulativeTotalRevenueUSD.minus(
        previousSnapshot.cumulativeTotalRevenueUSD
      );
    }
    snapshot.hourlySupplySideRevenueUSD = supplySideRevenueDelta;
    snapshot.hourlyProtocolSideRevenueUSD = protocolSideRevenueDelta;
    snapshot.hourlyTotalRevenueUSD = totalRevenueDelta;

    snapshot.save();
  }

  private takeDailySnapshot(day: i32): void {
    const snapshot = new PoolDailySnapshot(this.pool.id.concatI32(day));
    const previousSnapshot = PoolDailySnapshot.load(
      this.pool.id.concatI32(this.pool.lastSnapshotDayID)
    );

    snapshot.day = day;
    snapshot.protocol = this.pool.protocol;
    snapshot.pool = this.pool.id;
    snapshot.timestamp = this.event.block.timestamp;
    snapshot.blockNumber = this.event.block.number;

    // tvl and balances
    snapshot.totalValueLockedUSD = this.pool.totalValueLockedUSD;
    snapshot.inputTokenBalance = this.pool.inputTokenBalance;
    snapshot.totalLiquidity = this.pool.totalLiquidity;
    snapshot.totalLiquidityUSD = this.pool.totalLiquidityUSD;
    snapshot.stakedLiquidity = this.pool.stakedLiquidity;
    snapshot.rewardTokenEmissions = this.pool.rewardTokenEmissions;
    snapshot.rewardTokenEmissionsUSD = this.pool.rewardTokenEmissionsUSD;

    // revenues
    snapshot.cumulativeSupplySideRevenueUSD =
      this.pool.cumulativeSupplySideRevenueUSD;
    snapshot.cumulativeProtocolSideRevenueUSD =
      this.pool.cumulativeProtocolSideRevenueUSD;
    snapshot.cumulativeTotalRevenueUSD = this.pool.cumulativeTotalRevenueUSD;

    // deltas
    let supplySideRevenueDelta = snapshot.cumulativeSupplySideRevenueUSD;
    let protocolSideRevenueDelta = snapshot.cumulativeProtocolSideRevenueUSD;
    let totalRevenueDelta = snapshot.cumulativeTotalRevenueUSD;

    if (previousSnapshot) {
      supplySideRevenueDelta = snapshot.cumulativeSupplySideRevenueUSD.minus(
        previousSnapshot.cumulativeSupplySideRevenueUSD
      );
      protocolSideRevenueDelta =
        snapshot.cumulativeProtocolSideRevenueUSD.minus(
          previousSnapshot.cumulativeProtocolSideRevenueUSD
        );
      totalRevenueDelta = snapshot.cumulativeTotalRevenueUSD.minus(
        previousSnapshot.cumulativeTotalRevenueUSD
      );
    }
    snapshot.dailySupplySideRevenueUSD = supplySideRevenueDelta;
    snapshot.dailyProtocolSideRevenueUSD = protocolSideRevenueDelta;
    snapshot.dailyTotalRevenueUSD = totalRevenueDelta;

    snapshot.save();
  }
}
