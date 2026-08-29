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
  Text
} from '@vue-email/components'

defineProps({
  organizationName: String,
  inviterName: String,
  inviteLink: String
})

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif'
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px'
}

const box = {
  padding: '0 48px'
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0'
}

const paragraph = {
  color: '#525f7f',

  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const
}
const bold = {
  fontWeight: 'bold' as const
}
const h1 = {
  color: '#525f7f',
  fontSize: '36px',
  fontWeight: 'bold' as const,
  lineHeight: '44px',
  textAlign: 'center' as const
}

const button = {
  backgroundColor: '#57A1DB',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '10px'
}

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px'
}
const imageUrl = `data:image/svg+xml;base64,CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHRleHQgeT0iLjllbSIgZm9udC1zaXplPSI5MCI+8J+TpjwvdGV4dD48L3N2Zz4=`
</script>

<template>
  <Html>
    <Head />
    <Preview>
      You're invited to join {{ organizationName }}
    </Preview>
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
          <Text :style="h1">
            You're invited to join {{ organizationName }}
          </Text>
          <Text :style="{ ...paragraph, ...bold }">
            {{ inviterName }} has invited you to join {{ organizationName }}.
          </Text>
          <Button
            :style="button"
            :href="inviteLink"
          >
            Accept Invitation
          </Button>
          <Hr :style="hr" />

          <Text :style="paragraph">
            — Innovators Parts
          </Text>
          <Hr :style="hr" />
          <Text :style="footer">
            © {{ new Date().getFullYear() }} Innovators Parts
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
</template>
