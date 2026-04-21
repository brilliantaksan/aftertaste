import * as React from "react";
import { motion } from "framer-motion";
import { Clock, ClipboardCopy } from "lucide-react";

import { cn } from "../../lib/utils.js";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar.js";
import { Button } from "./button.js";
import { Card, CardContent, CardFooter, CardHeader } from "./card.js";

interface InsuranceCardProps {
  clientName: string;
  dateOfBirth: string;
  cityOfResidence: string;
  idNumber: string;
  policyNumber: string;
  insuranceType: string;
  vehicleInfo: string;
  expireDate: string;
  expireDuration: string;
  avatarSrc: string;
  qrCodeSrc: string;
  onUpdatePolicy?: () => void;
}

function InfoItem({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[var(--ink-faint)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--ink)]">{value}</span>
        {children}
      </div>
    </div>
  );
}

export function InsuranceCard({
  clientName,
  dateOfBirth,
  cityOfResidence,
  idNumber,
  policyNumber,
  insuranceType,
  vehicleInfo,
  expireDate,
  expireDuration,
  avatarSrc,
  qrCodeSrc,
  onUpdatePolicy,
}: InsuranceCardProps): React.JSX.Element {
  const handleCopy = async (text: string): Promise<void> => {
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(text);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2, ease: "easeOut" } }}
      className="w-full max-w-md"
    >
      <Card className="overflow-hidden rounded-[calc(var(--radius-md)+0.25rem)] border-[rgba(39,51,67,0.08)]">
        <CardHeader className="bg-[rgba(255,255,255,0.42)] p-6">
          <div className="flex items-start justify-between gap-8">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border-2 border-[rgba(255,255,255,0.9)]">
                <AvatarImage src={avatarSrc} alt={clientName} />
                <AvatarFallback>{clientName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-[var(--ink-faint)]">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-medium">Expire Date</span>
                </div>
                <p className="text-md font-bold text-[var(--ink)]">
                  {expireDate}{" "}
                  <span className="text-sm font-normal text-[var(--ink-faint)]">
                    ({expireDuration})
                  </span>
                </p>
              </div>
            </div>
            <img src={qrCodeSrc} alt="QR Code" className="h-16 w-16 rounded-md object-cover" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            <InfoItem label="Client Name" value={clientName} />
            <InfoItem label="Date of Birth" value={dateOfBirth} />
            <InfoItem label="City of Residence" value={cityOfResidence} />
            <InfoItem label="ID Number" value={idNumber} />
            <InfoItem label="Policy Number" value={policyNumber}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  void handleCopy(policyNumber);
                }}
              >
                <ClipboardCopy className="h-4 w-4 text-[var(--ink-faint)]" />
              </Button>
            </InfoItem>
            <InfoItem label="Type of Insurance" value={insuranceType} />
          </div>
          <div className="border-t border-[var(--line)] pt-4">
            <InfoItem label="Vehicle Information" value={vehicleInfo} />
          </div>
        </CardContent>

        <CardFooter className="bg-[rgba(255,255,255,0.42)] p-6">
          <Button className="w-full" onClick={onUpdatePolicy}>
            Update a Policy
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
