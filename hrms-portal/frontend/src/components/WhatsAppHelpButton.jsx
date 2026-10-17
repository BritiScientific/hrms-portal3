import { MessageCircle } from "lucide-react";

const WhatsAppHelpButton = () => {
  const openWhatsApp = () => {
    const phone =
      import.meta.env.VITE_COMPANY_WHATSAPP_NUMBER ||
      "918341024771";

    const message =
      "Hello HR Team, I need help with my HRMS account.";

    const url =
      `https://wa.me/${phone}` +
      `?text=${encodeURIComponent(message)}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <button
      className="whatsapp-help-button"
      onClick={openWhatsApp}
    >
      <MessageCircle size={20} />
      <span>WhatsApp HR Help</span>
    </button>
  );
};

export default WhatsAppHelpButton;