const jwt = require("jsonwebtoken");

const createToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      organizationId: user.organization_id,
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      employeeId: user.employee_id || null,
      departmentId: user.department_id || null
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d"
    }
  );
};

module.exports = {
  createToken
};
