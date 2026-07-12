import { Card, Text } from "@astryxdesign/core";

export function EscapeDemo() {
  return (
    <Card>
      <Text type="body">Tom &quot;TJ&quot; &lt;j&gt; &#123;x&#125; &amp; co</Text>
    </Card>
  );
}
