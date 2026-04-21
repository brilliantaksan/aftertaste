import React from "react";

import { OrderConfirmationCard } from "./order-confirmation-card.js";

export default function OrderConfirmationCardDemo(): React.JSX.Element {
  const handleGoToAccount = () => {
    window.alert("Navigating to your account...");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <OrderConfirmationCard
        orderId="57625869"
        paymentMethod="Apple Pay"
        dateTime="01/02/24 23:46"
        totalAmount="$ 129"
        onGoToAccount={handleGoToAccount}
      />
    </div>
  );
}
