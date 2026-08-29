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
import { APP_URL } from './site'

defineProps<{
  userName: string;
  memberName: string;
  organizationName: string;
  memberRole?: string;
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
    <Preview>{{ memberName }} joined {{ organizationName }}</Preview>
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
          <Text :style="h1"> New Team Member </Text>
          <Text :style="paragraph">Hi {{ userName }},</Text>
          <Text :style="paragraph">
            <strong>{{ memberName }}</strong> has joined
            <strong>{{ organizationName }}</strong>
            <span v-if="memberRole"> as a {{ memberRole }}</span
            >.
          </Text>
          <Text :style="paragraph">
            Welcome them and get started collaborating on orders and projects
            together!
          </Text>
          <Button :href="APP_URL" :style="button">
            View Team
          </Button>
          <Hr :style="hr" />
          <Text :style="paragraph"> — Innovators Parts </Text>
          <Hr :style="hr" />
          <Text :style="footer">
            © {{ new Date().getFullYear() }} Innovators Parts
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
</template>
