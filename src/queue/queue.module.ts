import { Module, forwardRef } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { QueueWorkerService } from "./queue-worker.service";
import { EventProcessorService } from "./event-processor.service";
import { ConnectorsModule } from "../connectors/connectors.module";

@Module({
  imports: [forwardRef(() => ConnectorsModule)],
  providers: [QueueService, QueueWorkerService, EventProcessorService],
  exports: [QueueService, EventProcessorService],
})
export class QueueModule {}
