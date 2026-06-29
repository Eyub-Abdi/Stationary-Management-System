-- Add FOOD to the expense categories (a petty-cash category for staff meals/food).
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'FOOD';
