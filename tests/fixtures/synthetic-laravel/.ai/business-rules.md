# Business Rules for Synthetic Laravel CRM

## Project Creation & Budget Validation
- All projects require a valid title and assigned owner ID.
- Project budgets must never be negative numbers.
- When an inquiry is converted into a project, its status must immediately update to 'active'.

## Department Permission Checking
- Department managers can only access resources matching their `department_id`.
- Cross-department operations require executive admin role approval.

