import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterShift } from './entities/cash-register-shift.entity';
import { CashTransaction } from './entities/cash-transaction.entity';

@Injectable()
export class CashRegisterService {
  constructor(
    @InjectRepository(CashRegister) private readonly registersRepository: Repository<CashRegister>,
    @InjectRepository(CashRegisterShift) private readonly shiftsRepository: Repository<CashRegisterShift>,
    @InjectRepository(CashTransaction) private readonly transactionsRepository: Repository<CashTransaction>
  ) {}

  async getCurrentShift(tenantId: string, userId: string): Promise<CashRegisterShift> {
    const shift = await this.shiftsRepository.findOne({
      where: { tenantId, userId, status: 'open' },
      order: { openedAt: 'DESC' },
    });
    if (!shift) throw new NotFoundException('لا توجد وردية مفتوحة');
    return shift;
  }

  async openShift(
    tenantId: string,
    cashRegisterId: string,
    openingBalance: number,
    notes: string | undefined,
    userId: string
  ): Promise<CashRegisterShift> {
    const register = await this.registersRepository.findOne({ where: { id: cashRegisterId, tenantId } });
    if (!register) throw new NotFoundException('الكاشير غير موجود');
    if (register.isOpen) throw new BadRequestException('يوجد وردية مفتوحة بالفعل على هذا الكاشير');

    const count = await this.shiftsRepository.count({ where: { tenantId } });
    const shift = this.shiftsRepository.create({
      tenantId,
      shiftNumber: `SHIFT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      cashRegisterId,
      userId,
      openedAt: new Date(),
      openingBalance,
      openingNotes: notes,
      status: 'open',
    });
    const saved = await this.shiftsRepository.save(shift);

    register.isOpen = true;
    register.currentShiftId = saved.id;
    await this.registersRepository.save(register);

    return saved;
  }

  async closeShift(
    tenantId: string,
    shiftId: string,
    actualCash: number,
    actualCard: number,
    notes: string | undefined
  ): Promise<CashRegisterShift> {
    const shift = await this.shiftsRepository.findOne({ where: { id: shiftId, tenantId } });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');

    shift.actualCash = actualCash;
    shift.actualCard = actualCard;
    shift.closingNotes = notes;
    shift.closedAt = new Date();
    shift.status = 'closed';
    const saved = await this.shiftsRepository.save(shift);

    const register = await this.registersRepository.findOne({ where: { id: shift.cashRegisterId, tenantId } });
    if (register) {
      register.isOpen = false;
      register.currentShiftId = undefined;
      await this.registersRepository.save(register);
    }

    return saved;
  }

  async addCashTransaction(
    tenantId: string,
    shiftId: string,
    type: 'cash_in' | 'cash_out' | 'expense',
    amount: number,
    description: string | undefined,
    userId: string
  ): Promise<CashTransaction> {
    const transaction = this.transactionsRepository.create({
      tenantId,
      shiftId,
      type,
      amount,
      description,
      createdBy: userId,
    });
    return this.transactionsRepository.save(transaction);
  }

  async findAllRegisters(tenantId: string): Promise<CashRegister[]> {
    return this.registersRepository.find({ where: { tenantId } });
  }

  async createRegister(tenantId: string, data: Partial<CashRegister>, userId?: string): Promise<CashRegister> {
    const register = this.registersRepository.create({ ...stripProtected(data), tenantId });
    return this.registersRepository.save(register);
  }
}
