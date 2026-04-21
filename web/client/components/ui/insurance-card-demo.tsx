import React from "react";

import { InsuranceCard } from "./insurance-card.js";

const QR_CODE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='12' fill='%23ffffff'/%3E%3Cg fill='%23273343'%3E%3Crect x='12' y='12' width='18' height='18'/%3E%3Crect x='18' y='18' width='6' height='6' fill='%23ffffff'/%3E%3Crect x='66' y='12' width='18' height='18'/%3E%3Crect x='72' y='18' width='6' height='6' fill='%23ffffff'/%3E%3Crect x='12' y='66' width='18' height='18'/%3E%3Crect x='18' y='72' width='6' height='6' fill='%23ffffff'/%3E%3Crect x='42' y='18' width='6' height='6'/%3E%3Crect x='48' y='24' width='6' height='6'/%3E%3Crect x='54' y='30' width='6' height='6'/%3E%3Crect x='42' y='42' width='6' height='6'/%3E%3Crect x='54' y='42' width='6' height='6'/%3E%3Crect x='60' y='48' width='6' height='6'/%3E%3Crect x='48' y='54' width='6' height='6'/%3E%3Crect x='54' y='60' width='6' height='6'/%3E%3Crect x='60' y='66' width='6' height='6'/%3E%3Crect x='66' y='54' width='6' height='6'/%3E%3Crect x='72' y='60' width='6' height='6'/%3E%3Crect x='30' y='54' width='6' height='6'/%3E%3Crect x='24' y='60' width='6' height='6'/%3E%3Crect x='36' y='66' width='6' height='6'/%3E%3C/g%3E%3C/svg%3E";

export default function InsuranceCardDemo(): React.JSX.Element {
  const policyDetails = {
    clientName: "Jeremy Allen White",
    dateOfBirth: "09 Jan 1992",
    cityOfResidence: "Los Angeles, CA",
    idNumber: "756872004",
    policyNumber: "NPX 47208716",
    insuranceType: "Car Insurance",
    vehicleInfo: "Bentley Bentayga, 2019",
    expireDate: "21 Sep 2025",
    expireDuration: "2 years",
    avatarSrc:
      "https://plus.unsplash.com/premium_photo-1739196926899-bd9c5a765ca3?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTN8fHByb2ZpbGV8ZW58MHwyfDB8fHww&auto=format&fit=crop&q=60&w=900",
    qrCodeSrc: QR_CODE_PLACEHOLDER,
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <InsuranceCard
        {...policyDetails}
        onUpdatePolicy={() => {
          console.log("Update Policy button clicked!");
        }}
      />
    </div>
  );
}
