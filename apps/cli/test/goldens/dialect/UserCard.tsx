import { Button, Card, Heading, Text, VStack } from "@astryxdesign/core";

export function UserCard() {
  return (
    <Card>
      <VStack gap={2}>
        <Heading level={3}>Profile</Heading>
        <Text type="body">Member since 2026</Text>
        <Button variant="primary">Edit</Button>
      </VStack>
    </Card>
  );
}
