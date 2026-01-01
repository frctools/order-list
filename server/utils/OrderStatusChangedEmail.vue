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

defineProps({
  userName: String,
  orderPartName: String,
  oldStatus: String,
  newStatus: String,
  organizationName: String,
  orderId: String,
});

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
  fontSize: "32px",
  fontWeight: "bold" as const,
  lineHeight: "44px",
  textAlign: "center" as const,
};

const badge = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: "4px",
  backgroundColor: "#f0f4f8",
  color: "#1a202c",
  fontWeight: "bold",
  marginRight: "8px",
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
      >Order status updated: {{ orderPartName }} is now {{ newStatus }}</Preview
    >
    <Body :style="main">
      <Container :style="container">
        <Section :style="box">
          <Img
            :src="`${imageUrl}`"
            width="49"
            height="49"
            alt="FRCTools Orders Logo"
          />
          <Hr :style="hr" />
          <Text :style="h1"> Order Status Updated </Text>
          <Text :style="paragraph">Hi {{ userName }},</Text>
          <Text :style="paragraph">
            An order in <strong>{{ organizationName }}</strong> has been
            updated:
          </Text>
          <Text :style="paragraph">
            <strong>Part Name:</strong> {{ orderPartName }}
          </Text>
          <Text :style="paragraph">
            <strong>Status:</strong>
            <span :style="badge">{{ oldStatus }}</span>
            <span style="margin: 0 8px">→</span>
            <span :style="badge">{{ newStatus }}</span>
          </Text>
          <Button
            :href="`https://orders.frctools.com/app?order=${orderId}`"
            :style="button"
          >
            View Order
          </Button>
          <Hr :style="hr" />
          <Text :style="paragraph"> — FRCTools Orders </Text>
          <Hr :style="hr" />
          <Text :style="footer">
            You received this email because you're a member of
            {{ organizationName }}.
            <br />
            <a
              href="https://orders.frctools.com/settings"
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
