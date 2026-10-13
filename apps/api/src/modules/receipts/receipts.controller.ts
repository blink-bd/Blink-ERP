import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReceiptsService } from './receipts.service';

@ApiTags('electronic-receipts')
@Controller({ path: 'receipts', version: '1' })
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get('purchase/:token')
  async getPurchase(@Param('token') token: string) {
    return { success: true, data: await this.receipts.findPublicPurchase(token) };
  }

  @Get(':token')
  async getReceipt(@Param('token') token: string) {
    return { success: true, data: await this.receipts.findPublicReceipt(token) };
  }
}
