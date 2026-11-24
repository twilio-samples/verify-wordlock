import { Box } from "@twilio-paste/core/box";
import { Heading } from "@twilio-paste/core/heading";
import { Button } from "@twilio-paste/core/button";
import { Text } from "@twilio-paste/core/text";
import { Avatar } from "@twilio-paste/core/avatar";
import { Paragraph } from "@twilio-paste/core/paragraph";
import { Separator } from "@twilio-paste/core/separator";
import { SkeletonLoader } from "@twilio-paste/core/skeleton-loader";
import { Stack } from "@twilio-paste/core/stack";
import { Alert } from "@twilio-paste/core/alert";
import { Anchor } from "@twilio-paste/core/anchor";
import react from "react";
import type { NextPage } from "next";
import Head from "next/head";
import { useUID } from "@twilio-paste/core/uid-library";
import {
  MediaObject,
  MediaFigure,
  MediaBody,
} from "@twilio-paste/core/media-object";
import { StatusBadge } from "@twilio-paste/core/status";
import { LockIcon } from "@twilio-paste/icons/cjs/LockIcon";
import VaultLedPanel from "../components/VaultLedPanel";

import {
  VisualPickerRadioGroup,
  VisualPickerRadio,
} from "@twilio-paste/core/visual-picker";

const Admin: NextPage = () => {
  const [locks, updateLocks] = react.useState<
    {
      deviceId: string;
      deviceStatus: string;
      deviceName: string;
      batteryLevel: number;
      lockStatus: string;
    }[]
  >([]);
  const [selectedLock, selectLock] = react.useState("");
  const [locksError, setLocksError] = react.useState("");


  const unlockBox = async () => {
    const response = await fetch("/api/admin/unlock", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lockId: selectedLock }),
    });

    const { message } = await response.json();
    console.log(message);
    const lockIndex = locks.findIndex((lock: { deviceId: string }) => {
      return lock.deviceId === selectedLock;
    });
    var newLocks: any[] = locks.slice();
    newLocks[lockIndex] = { ...locks[lockIndex], lockStatus: "UNLOCKING" };
    updateLocks(newLocks);
  };

  const fetchLockStatus = async () => {
    try {
      const response = await fetch("/api/admin/devices", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (!response.ok) {
        setLocksError(data.message || "Unable to load locks");
        updateLocks([]);
        return;
      }

      setLocksError("");
      updateLocks(data.locks || []);
    } catch (error) {
      setLocksError("Unable to load locks");
      updateLocks([]);
    }
  };

  react.useEffect(() => {
    fetchLockStatus();
  }, []);

  return (
    <Box as="main" padding="space70">
      <Head>
        <title>Admin · Twilio Wordlock</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Heading as="h1" variant="heading10">
        Admin
      </Heading>
      <Paragraph>Powered by Twilio Verify</Paragraph>
      <Separator orientation={"horizontal"} verticalSpacing="space80" />

      <Stack orientation="horizontal" spacing="space60">
        <Anchor href="/admin/settings">Event settings</Anchor>
        <Anchor href="/stats">Stats</Anchor>
      </Stack>
      <Separator orientation={"horizontal"} verticalSpacing="space80" />

      <Heading as="h2" variant="heading30">
        Locks
      </Heading>
      {locksError && <Alert variant="warning">{locksError}</Alert>}
      <VisualPickerRadioGroup
        name={useUID()}
        id={useUID()}
        onChange={(x) => {
          selectLock(x);
        }}
        value={selectedLock}
        legend={
          <Text as="span" color="currentColor">
            Select Lock
          </Text>
        }
      >
        {!locksError && locks.length === 0 && <SkeletonLoader />}
        {locks.map((lock, index) => {
          return (
            <VisualPickerRadio
              labelText={lock.deviceName}
              value={lock.deviceId}
              key={index}
            >
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                columnGap="space100"
              >
                <MediaObject verticalAlign="center">
                  <MediaFigure spacing="space50">
                    <Avatar
                      variant="entity"
                      icon={LockIcon}
                      size="sizeIcon90"
                      name="code"
                      color="decorative20"
                    />
                  </MediaFigure>
                  <MediaBody>
                    <Text as="div" fontWeight="fontWeightSemibold">
                      {lock.deviceName}
                    </Text>
                    <Text as="div" color="colorTextWeak">
                      Battery Level: {lock.batteryLevel}%
                    </Text>
                  </MediaBody>
                </MediaObject>
                {lock.lockStatus === "UNLOCKED" && (
                  <StatusBadge as="span" variant="ConnectivityAvailable">
                    Locked
                  </StatusBadge>
                )}
                {lock.lockStatus === "LOCKED" && (
                  <StatusBadge as="span" variant="ConnectivityUnavailable">
                    Unlocked
                  </StatusBadge>
                )}
                {lock.lockStatus === "UNLOCKING" && (
                  <StatusBadge as="span" variant="ConnectivityBusy">
                    UNLOCKING
                  </StatusBadge>
                )}
              </Box>
            </VisualPickerRadio>
          );
        })}
      </VisualPickerRadioGroup>
      <Separator orientation={"horizontal"} verticalSpacing="space80" />
      <Button
        variant="primary"
        fullWidth
        disabled={selectedLock === ""}
        onClick={() => {
          unlockBox();
        }}
      >
        Unlock
      </Button>
      <Separator orientation={"horizontal"} verticalSpacing="space80" />
      <VaultLedPanel />
    </Box>
  );
};

export default Admin;
