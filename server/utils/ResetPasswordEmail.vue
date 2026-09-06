<script setup lang="ts">
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text
} from '@vue-email/components'

defineProps<{
  userName?: string
  resetLink: string
}>()

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif'
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px'
}

const box = { padding: '0 48px' }
const hr = { borderColor: '#e6ebf1', margin: '20px 0' }
const paragraph = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const
}
const heading = {
  color: '#525f7f',
  fontSize: '30px',
  fontWeight: 'bold' as const,
  lineHeight: '38px',
  textAlign: 'center' as const
}
const button = {
  backgroundColor: '#57A1DB',
  borderRadius: '5px',
  color: '#fff',
  display: 'block',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '10px',
  textAlign: 'center' as const,
  textDecoration: 'none'
}
const footer = { color: '#8898aa', fontSize: '12px', lineHeight: '16px' }
</script>

<template>
  <Html>
    <Head />
    <Preview>Reset your FRCTools Orders password</Preview>
    <Body :style="main">
      <Container :style="container">
        <Section :style="box">
          <Text :style="heading">
            Reset your password
          </Text>
          <Text :style="paragraph">
            Hi {{ userName || 'there' }}, we received a request to reset your
            FRCTools Orders password.
          </Text>
          <Button
            :href="resetLink"
            :style="button"
          >
            Reset password
          </Button>
          <Text :style="paragraph">
            This link expires in one hour. If you didn't request a password
            reset, you can safely ignore this email.
          </Text>
          <Hr :style="hr" />
          <Text :style="footer">
            © {{ new Date().getFullYear() }} FRCTools Orders
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
</template>
