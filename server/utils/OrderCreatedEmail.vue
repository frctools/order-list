<script setup lang="ts">
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@vue-email/components";
import { APP_URL, SETTINGS_URL } from './site'

defineProps<{
  userName: string;
  orderPartName: string;
  orderDescription?: string;
  organizationName: string;
  orderId: string;
}>();

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const box = {
  padding: "0 48px",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  textAlign: "left" as const,
};

const h1 = {
  color: "#525f7f",
  fontSize: "36px",
  fontWeight: "bold" as const,
  lineHeight: "44px",
  textAlign: "center" as const,
};

const button = {
  backgroundColor: "#57A1DB",
  borderRadius: "5px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  width: "100%",
  padding: "10px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
};

const imageUrl = `data:image/svg+xml;base64,CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHRleHQgeT0iLjllbSIgZm9udC1zaXplPSI5MCI+8J+TpjwvdGV4dD48L3N2Zz4=`;
</script>

<template>
  <Html>
    <Head />
    <Preview
      >{{ userName }}, a new order was created in
      {{ organizationName }}</Preview
    >
    <Body :style="main">
      <Container :style="container">
        <Section :style="box">
          <Img
            :src="`${imageUrl}`"
            width="49"
            height="49"
            alt="Innovators Parts Logo"
          />
          <Hr :style="hr" />
          <Text :style="h1"> New Order Created </Text>
          <Text :style="paragraph">Hi {{ userName }},</Text>
          <Text :style="paragraph">
            A new order has been created in
            <strong>{{ organizationName }}</strong
            >:
          </Text>
          <Text :style="paragraph">
            <strong>Part Name:</strong> {{ orderPartName }}
          </Text>
          <Text v-if="orderDescription" :style="paragraph">
            <strong>Description:</strong> {{ orderDescription }}
          </Text>
          <Text :style="paragraph">
            Review and manage this order in your dashboard.
          </Text>
          <Button
            :href="`${APP_URL}?order=${orderId}`"
            :style="button"
          >
            View Order
          </Button>
          <Hr :style="hr" />
          <Text :style="paragraph"> — Innovators Parts </Text>
          <Hr :style="hr" />
          <Text :style="footer">
            You received this email because you're a member of
            {{ organizationName }}.
            <br />
            <a
              :href="SETTINGS_URL"
              style="color: #4f46e5; text-decoration: underline"
            >
              Manage notification preferences
            </a>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
</template>
