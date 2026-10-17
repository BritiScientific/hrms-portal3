const createWhatsAppHelpLink = async (req, res) => {
  const phone =
    process.env.COMPANY_WHATSAPP_NUMBER;

  if (!phone) {
    return res.status(500).json({
      message: "Company WhatsApp number is not configured"
    });
  }

  const message =
    `Hello HR Team,\n\n` +
    `I need help with my HRMS account.\n` +
    `Employee/User: ${req.user.fullName}\n` +
    `User ID: ${req.user.id}\n` +
    `Issue: `;

  const whatsappUrl =
    `https://wa.me/${phone}` +
    `?text=${encodeURIComponent(message)}`;

  return res.json({
    whatsappUrl
  });
};

module.exports = {
  createWhatsAppHelpLink
};