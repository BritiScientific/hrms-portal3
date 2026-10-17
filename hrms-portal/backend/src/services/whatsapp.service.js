const axios = require("axios");

const sendWhatsAppText = async ({
  recipientPhone,
  message
}) => {
  if (
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    !process.env.WHATSAPP_ACCESS_TOKEN
  ) {
    throw new Error("WhatsApp Cloud API credentials are missing");
  }

  const url =
    `https://graph.facebook.com/` +
    `${process.env.WHATSAPP_API_VERSION}/` +
    `${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "text",
      text: {
        preview_url: false,
        body: message
      }
    },
    {
      headers: {
        Authorization:
          `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
};

module.exports = {
  sendWhatsAppText
};